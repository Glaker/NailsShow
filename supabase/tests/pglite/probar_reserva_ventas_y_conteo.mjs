// Ventas reserva desde el pedido y, si queda todo reservado, lo aprueba sin
// pedir fecha (20261110130000). Actualizar stock de insumos sin recepción
// (20261110130100).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('gerencia@x', 'GERENCIA');
await usuario('silveira@x', 'RECEPCION');
await usuario('cc@x', 'CONTROL_CALIDAD');
const N = (x) => Number(x ?? 0);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const [p101, p102] = [await prod('101'), await prod('102')];
const BER = (await uno(`select id from gmp.depositos where numero='BER'`)).id;

await db.exec('reset role');
await db.exec('set session_replication_role = replica');
for (const [p, c] of [
  [p101, 10],
  [p102, 3],
])
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',$3,'stock de prueba',(select id from core.usuarios where email='naza@x'))`,
    [p, BER, c],
  );
await db.exec('set session_replication_role = origin');

await como('mati@x');
const venta = async (numero, renglones) => {
  const id = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta) values ($1,'Kiosco Pepe',true) returning id`,
      [numero],
    )
  ).id;
  for (const [p, c] of renglones)
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
      [id, p, c],
    );
  return id;
};
const reservar = (pedido, p, c) =>
  q(
    `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,$4)`,
    [p, BER, pedido, c],
  );
const estado = async (id) =>
  (await uno(`select estado from comercial.pedidos where id=$1`, [id])).estado;

const vTodo = await venta('V-T', [[p101, 4]]);
const vParte = await venta('V-P', [
  [p101, 2],
  [p102, 9],
]);

await prueba('Mati reserva en borrador', async () => {
  await reservar(vTodo, p101, 4);
  await reservar(vParte, p101, 2);
  await reservar(vParte, p102, 3);
});
await rechaza(
  'con algo sin reservar no se aprueba sin fecha',
  `select comercial.aprobar_venta_reservada('${vParte}')`,
  /falta reservar/,
);
await como('naza@x');
await rechaza(
  'GP no usa este atajo',
  `select comercial.aprobar_venta_reservada('${vTodo}')`,
  /Ventas/,
);
await como('mati@x');
await prueba('todo reservado: Ventas lo aprueba para hoy', async () => {
  await q(`select comercial.aprobar_venta_reservada($1)`, [vTodo]);
  if ((await estado(vTodo)) !== 'CONFIRMADO') throw new Error(await estado(vTodo));
  const r = await uno(
    `select sum(a_producir) a, sum(de_calle5) d from comercial.pedido_renglones where pedido_id=$1`,
    [vTodo],
  );
  if (N(r.a) !== 0 || N(r.d) !== 4) throw new Error(JSON.stringify(r));
  const p = await uno(`select nota from comercial.propuestas_fecha where pedido_id=$1`, [
    vTodo,
  ]);
  if (!/Ventas/.test(p.nota)) throw new Error(p.nota);
});
await prueba('lo que falta va a Producción con lo reservado intacto', async () => {
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [vParte]);
  const r = await uno(
    `select sum(cantidad - consumido) s from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [vParte],
  );
  if (N(r.s) !== 5) throw new Error(JSON.stringify(r));
});

// ---- Stock de insumos sin recepción ----
await como('silveira@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ETQ-Z1', 'Etiqueta Z', 'ETIQUETA', 'UNIDAD') returning id`,
  )
).id;
const saldo = async () =>
  N(
    (
      await uno(
        `select sum(saldo) s from comercial.v_saldos_stock where articulo_id = comercial.articulo_de_insumo($1)`,
        [ins],
      )
    ).s,
  );
await rechaza(
  'Recepción no actualiza stock',
  `select comercial.registrar_conteo('${ins}', 5, null, false)`,
  /Gerencia/,
);
await como('naza@x');
await prueba('Naza carga 500 sin recepción ni lote previo', async () => {
  await q(`select comercial.registrar_conteo($1, 500, 'llegaron', false)`, [ins]);
  if ((await saldo()) !== 500) throw new Error(String(await saldo()));
  const c = await uno(
    `select cantidad_contada, saldo_previo from comercial.conteos_inventario where insumo_id=$1`,
    [ins],
  );
  if (N(c.cantidad_contada) !== 500 || N(c.saldo_previo) !== 0)
    throw new Error(JSON.stringify(c));
});
await como('gerencia@x');
await prueba('Gerencia lo baja a 120 y queda el historial', async () => {
  await q(`select comercial.registrar_conteo($1, 120, null, false)`, [ins]);
  if ((await saldo()) !== 120) throw new Error(String(await saldo()));
  const n = await uno(`select count(*) n from comercial.conteos_inventario where insumo_id=$1`, [
    ins,
  ]);
  if (N(n.n) !== 2) throw new Error(JSON.stringify(n));
});

// Un insumo con stock de recepción: bajar más que el saldo de apertura.
await como('silveira@x');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov Z') returning id`)
).id;
const ins2 = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-Z2', 'Frasco Z', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'RZ', true) returning id`,
    [prov],
  )
).id;
await q(
  `insert into gmp.lotes_insumo (recepcion_id, insumo_id, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
   values ($1, $2, 1, 100, 'UNIDAD', true)`,
  [rec, ins2],
);
await como('salta.agustin@gmail.com', 'DIRECCION_TECNICA');
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
const saldo2 = async () =>
  N(
    (
      await uno(
        `select sum(saldo) s from comercial.v_saldos_stock where articulo_id = comercial.articulo_de_insumo($1)`,
        [ins2],
      )
    ).s,
  );
await como('naza@x');
await prueba('Naza baja a 30 un insumo que entró por recepción', async () => {
  await q(`select comercial.registrar_conteo($1, 30, null, false)`, [ins2]);
  if ((await saldo2()) !== 30) throw new Error(String(await saldo2()));
  const m = await q(
    `select cantidad from comercial.movimientos_stock where documento_tipo='CONTEO' and articulo_id = comercial.articulo_de_insumo($1)`,
    [ins2],
  );
  if (m.length !== 1 || N(m[0].cantidad) !== -70) throw new Error(JSON.stringify(m));
});
await prueba('y lo vuelve a subir a 80 (entra al saldo de apertura)', async () => {
  await q(`select comercial.registrar_conteo($1, 80, null, false)`, [ins2]);
  if ((await saldo2()) !== 80) throw new Error(String(await saldo2()));
});
await prueba('y a 0: vacía apertura y recepción', async () => {
  await q(`select comercial.registrar_conteo($1, 0, null, false)`, [ins2]);
  if ((await saldo2()) !== 0) throw new Error(String(await saldo2()));
});

await invariantes();
await fin();
