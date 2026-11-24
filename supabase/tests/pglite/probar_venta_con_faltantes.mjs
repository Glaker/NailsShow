// Ventas aprueba un pedido con faltantes y lo despacha con menos unidades
// (20261118160000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const [p101, p102, p103] = [await prod('101'), await prod('102'), await prod('103')];
const BER = (await uno(`select id from gmp.depositos where numero='BER'`)).id;

await db.exec('reset role');
await db.exec('set session_replication_role = replica');
for (const [p, c] of [
  [p101, 10],
  [p102, 2],
])
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',$3,'stock de prueba',(select id from core.usuarios where email='naza@x'))`,
    [p, BER, c],
  );
await db.exec('set session_replication_role = origin');

const saldo = async (p) =>
  N(
    (
      await uno(
        `select sum(cantidad) s from comercial.movimientos_pt where producto_id=$1 and deposito_id=$2`,
        [p, BER],
      )
    ).s,
  );

await como('mati@x');
const nuevo = async (numero) => {
  const v = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta, deposito_origen_id) values ($1,'Kiosco Pepe',true,$2) returning id`,
      [numero, BER],
    )
  ).id;
  // 101: pide 5, hay 10. 102: pide 6, hay 2. 103: pide 4, no hay.
  for (const [p, c] of [
    [p101, 5],
    [p102, 6],
    [p103, 4],
  ])
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
      [v, p, c],
    );
  return v;
};
const v = await nuevo('V-F1');

await rechaza(
  'sin nota no se aprueba con faltantes',
  `select comercial.aprobar_venta_con_faltantes('${v}', '  ')`,
  /nota/,
);
await rechaza(
  'el camino normal sigue pidiendo todo reservado',
  `select comercial.aprobar_venta_reservada('${v}')`,
  /falta reservar/,
);
await como('naza@x');
await rechaza(
  'GP no aprueba con faltantes',
  `select comercial.aprobar_venta_con_faltantes('${v}', 'x')`,
  /Ventas/,
);
await como('mati@x');

await prueba('Mati aprueba con faltantes: toma lo que hay y no pide a Producción', async () => {
  const r = await uno(`select comercial.aprobar_venta_con_faltantes($1, $2) j`, [
    v,
    '102 y 103 sin stock, el cliente lo acepta',
  ]);
  if (N(r.j.a_producir) !== 0 || r.j.pedido_stock) throw new Error(JSON.stringify(r.j));
  const p = await uno(`select estado, faltantes_nota from comercial.pedidos where id=$1`, [v]);
  if (p.estado !== 'CONFIRMADO' || !/sin stock/.test(p.faltantes_nota))
    throw new Error(JSON.stringify(p));
  const s = await uno(`select count(*) n from comercial.pedidos where para_pedido_id=$1`, [v]);
  if (N(s.n) !== 0) throw new Error('se crearon pedidos de stock: ' + s.n);
  const res = await uno(
    `select coalesce(sum(cantidad) filter (where producto_id=$2),0) a, coalesce(sum(cantidad) filter (where producto_id=$3),0) b
       from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [v, p101, p102],
  );
  if (N(res.a) !== 5 || N(res.b) !== 2) throw new Error(JSON.stringify(res));
});

await prueba('Despachado: no mueve stock y la observación dice qué sale con menos', async () => {
  await q(`select comercial.despachar_pedido_reservado($1, 'retira el cliente')`, [v]);
  if ((await saldo(p101)) !== 10) throw new Error('101 ' + (await saldo(p101)));
  if ((await saldo(p102)) !== 2) throw new Error('102 ' + (await saldo(p102)));
  const d = await uno(`select observacion from comercial.despachos_pt where pedido_id=$1`, [v]);
  if (!/retira el cliente · Sale con menos: 102 sale 2 de 6, 103 sale 0 de 4/.test(d.observacion))
    throw new Error(d.observacion);
  const p = await uno(`select estado from comercial.pedidos where id=$1`, [v]);
  if (p.estado !== 'CUMPLIDO') throw new Error(p.estado);
});

await prueba('sin faltantes, la observación queda como antes', async () => {
  const w = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta, deposito_origen_id) values ('V-F2','Kiosco Pepe',true,$1) returning id`,
      [BER],
    )
  ).id;
  await q(
    `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,2)`,
    [w, p101],
  );
  await q(
    `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,2)`,
    [p101, BER, w],
  );
  await q(`select comercial.aprobar_venta_reservada($1)`, [w]);
  await q(`select comercial.despachar_pedido_reservado($1)`, [w]);
  const d = await uno(`select observacion from comercial.despachos_pt where pedido_id=$1`, [w]);
  if (d.observacion !== 'Despachado por Ventas · El stock baja con la factura X') throw new Error(d.observacion);
});

const x = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, es_venta, deposito_origen_id) values ('V-F3','Kiosco Pepe',true,$1) returning id`,
    [BER],
  )
).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,2)`, [x, p103]);
await rechaza(
  'sin nada en stock no se aprueba con faltantes',
  `select comercial.aprobar_venta_con_faltantes('${x}', 'nada')`,
  /nada en stock/,
);

await invariantes();
fin();
