// Orden terminada → stock de fábrica retenido → la DT libera → se vende
// (20261022150100). Y una sola entrada por orden aunque el pedido se termine.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes, liberarAtajo } =
  await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('agus@x', 'VENTAS', 'ADMINISTRACION');
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [duo],
  )
).id;
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
const stock = () =>
  uno(
    `select coalesce(sum(saldo),0) saldo, coalesce(sum(retenido),0) retenido from comercial.v_stock_pt where deposito_id=$1 and producto_id=$2`,
    [PTF, duo],
  );
const orden = async (partida) => {
  await como('naza@x');
  const o = (
    await uno(
      `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,$3,1) returning id`,
      [f, duo, partida],
    )
  ).id;
  await como('op@x');
  await q(
    `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`,
    [o],
  );
  await como('naza@x');
  return o;
};

const o1 = await orden(1);
await prueba('terminar la orden carga lo obtenido en PTF, retenido', async () => {
  await q(`select comercial.terminar_orden($1, 5, 10)`, [o1]);
  const s = await stock();
  if (N(s.saldo) !== 10 || N(s.retenido) !== 10) throw new Error(JSON.stringify(s));
  const m = await uno(
    `select orden_id, documento_tipo from comercial.movimientos_pt where orden_id=$1`,
    [o1],
  );
  if (m.documento_tipo !== 'ORDEN') throw new Error(JSON.stringify(m));
});
await rechaza(
  'una entrada por orden no se inserta suelta',
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, documento_tipo, documento_id, orden_id) values ('${duo}','${PTF}','ENTRADA_PRODUCCION',3,'ORDEN','${o1}','${o1}')`,
  /orden terminados/,
);
await liberarAtajo(o1);
await como('naza@x');
await prueba('liberada por la DT, deja de estar retenida', async () => {
  const s = await stock();
  if (N(s.saldo) !== 10 || N(s.retenido) !== 0) throw new Error(JSON.stringify(s));
});
await prueba('y se puede mandar a Calle 5', async () => {
  await q(`select comercial.transferir_pt($1, 4, 'PTF', 'C5')`, [duo]);
});

// Berna (20261022150200): se mueve en cualquier sentido entre los tres.
await prueba(
  'de la fábrica a Berna, de Berna a Calle 5 y de vuelta a la fábrica',
  async () => {
    await q(`select comercial.transferir_pt($1, 3, 'PTF', 'BER')`, [duo]);
    await q(`select comercial.transferir_pt($1, 1, 'BER', 'C5')`, [duo]);
    await q(`select comercial.transferir_pt($1, 1, 'C5', 'PTF')`, [duo]);
    const b = await uno(
      `select saldo from comercial.v_stock_pt v join gmp.depositos d on d.id=v.deposito_id where d.numero='BER' and producto_id=$1`,
      [duo],
    );
    if (N(b.saldo) !== 2) throw new Error(JSON.stringify(b));
  },
);
const o4 = await orden(4);
await q(`select comercial.terminar_orden($1, 5, 6)`, [o4]);
await rechaza(
  'lo retenido no sale de la fábrica a Berna',
  `select comercial.transferir_pt('${duo}', 5, 'PTF', 'BER')`,
  /solo 4/,
);

// Orden con pedido: entra una sola vez, se termine primero la orden o el pedido.
const pedido = async (numero, cant) => {
  const p = (
    await uno(
      `insert into comercial.pedidos (numero, cliente) values ($1,'Ana') returning id`,
      [numero],
    )
  ).id;
  await q(
    `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,$3,1)`,
    [p, duo, cant],
  );
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
  return p;
};
// Sin material en la base de prueba: consumo cero con motivo.
const terminarPedido = async (p) => {
  const cons = (await q(`select insumo_id from comercial.necesidad_pedido($1)`, [p])).map(
    (x) => ({
      insumo_id: x.insumo_id,
      cantidad: 0,
      motivo: 'prueba sin material',
    }),
  );
  await q(`select comercial.terminar_pedido($1, $2::jsonb)`, [p, JSON.stringify(cons)]);
};
const o2 = await orden(2);
const p2 = await pedido('P-2', 7);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [
  p2,
  o2,
]);
await prueba('orden primero, pedido después: no se duplica', async () => {
  await q(`select comercial.terminar_orden($1, 5, 7)`, [o2]);
  const d = await uno(
    `select documento_tipo, documento_id from comercial.movimientos_pt where orden_id=$1`,
    [o2],
  );
  if (d.documento_tipo !== 'PEDIDO' || d.documento_id !== p2)
    throw new Error('a nombre del pedido: ' + JSON.stringify(d));
  await terminarPedido(p2);
  const n = await uno(
    `select sum(cantidad) c from comercial.movimientos_pt where orden_id=$1 and tipo='ENTRADA_PRODUCCION'`,
    [o2],
  );
  if (N(n.c) !== 7) throw new Error(JSON.stringify(n));
  const e = await uno(`select estado from comercial.pedidos where id=$1`, [p2]);
  if (e.estado !== 'CUMPLIDO') throw new Error(JSON.stringify(e));
});
const o3 = await orden(3);
const p3 = await pedido('P-3', 2);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [
  p3,
  o3,
]);
await prueba('pedido primero, orden después: no se duplica', async () => {
  await terminarPedido(p3);
  await q(`select comercial.terminar_orden($1, 5, 2)`, [o3]);
  const n = await uno(
    `select sum(cantidad) c from comercial.movimientos_pt where orden_id=$1 and tipo='ENTRADA_PRODUCCION'`,
    [o3],
  );
  if (N(n.c) !== 2) throw new Error(JSON.stringify(n));
});

// Carga inicial a mano en Calle 5 (Agustina, Silveira).
for (const quien of ['agus@x', 'silveira@x']) {
  await como(quien);
  await prueba(`${quien} cuenta producto terminado en Calle 5`, async () => {
    await q(`select comercial.registrar_conteo_pt($1, 20, 'carga inicial', 'C5')`, [duo]);
  });
}
await como('op@x');
await rechaza(
  'un operario no carga stock',
  `select comercial.registrar_conteo_pt('${duo}', 99, null, 'C5')`,
  /row-level|política|policy/,
);

await invariantes();
fin();
