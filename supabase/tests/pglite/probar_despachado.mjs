// Ventas marca un pedido despachado (sale lo reservado del stock) y cambia lo
// reservado de un producto (20261118120000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
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

const saldo = async (p) =>
  N(
    (
      await uno(
        `select sum(cantidad) s from comercial.movimientos_pt where producto_id=$1 and deposito_id=$2`,
        [p, BER],
      )
    ).s,
  );
const reservado = async (pedido, p) =>
  N(
    (
      await uno(
        `select sum(cantidad - consumido) s from comercial.reservas_pt where pedido_id=$1 and producto_id=$2 and not liberada`,
        [pedido, p],
      )
    ).s,
  );

await como('mati@x');
const v = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, es_venta, deposito_origen_id) values ('V-D','Kiosco Pepe',true,$1) returning id`,
    [BER],
  )
).id;
for (const [p, c] of [
  [p101, 5],
  [p102, 3],
])
  await q(
    `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
    [v, p, c],
  );
await q(
  `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,2),($4,$2,$3,3)`,
  [p101, BER, v, p102],
);

await prueba('Mati sube lo reservado de 101 de 2 a 4', async () => {
  await q(`select comercial.cambiar_reserva_pedido($1,$2,$3,4)`, [v, p101, BER]);
  if ((await reservado(v, p101)) !== 4) throw new Error(String(await reservado(v, p101)));
  const l = await uno(
    `select motivo_liberacion from comercial.reservas_pt where pedido_id=$1 and producto_id=$2 and liberada`,
    [v, p101],
  );
  if (!/de 2 a 4/.test(l.motivo_liberacion)) throw new Error(l.motivo_liberacion);
});
await rechaza(
  'no se reserva más de lo que lleva el pedido',
  `select comercial.cambiar_reserva_pedido('${v}','${p101}','${BER}',6)`,
  /lleva/,
);
await rechaza(
  'no se reserva más de lo libre',
  `select comercial.cambiar_reserva_pedido('${v}','${p102}','${BER}',3.5)`,
  /lleva|reservar más/,
);
await prueba('baja 102 a 1', async () => {
  await q(`select comercial.cambiar_reserva_pedido($1,$2,$3,1)`, [v, p102, BER]);
  if ((await reservado(v, p102)) !== 1) throw new Error(String(await reservado(v, p102)));
});
await como('naza@x');
await rechaza(
  'GP no cambia reservas de Ventas',
  `select comercial.cambiar_reserva_pedido('${v}','${p102}','${BER}',2)`,
  /Ventas/,
);
await rechaza(
  'GP no marca despachado',
  `select comercial.despachar_pedido_reservado('${v}')`,
  /Ventas/,
);
await como('mati@x');
await rechaza(
  'sin aprobar no se despacha',
  `select comercial.despachar_pedido_reservado('${v}')`,
  /aprobado/,
);

await prueba('todo reservado, se aprueba; aprobado se sigue editando', async () => {
  await q(`select comercial.cambiar_reserva_pedido($1,$2,$3,5)`, [v, p101, BER]);
  await q(`select comercial.cambiar_reserva_pedido($1,$2,$3,3)`, [v, p102, BER]);
  await q(`select comercial.aprobar_venta_reservada($1)`, [v]);
  await q(`select comercial.cambiar_reserva_pedido($1,$2,$3,1)`, [v, p102, BER]);
  if ((await reservado(v, p102)) !== 1) throw new Error(String(await reservado(v, p102)));
});
await prueba('Despachado: no mueve stock (lo baja la factura) y el pedido queda entregado', async () => {
  await q(`select comercial.despachar_pedido_reservado($1, 'lo retiró')`, [v]);
  if ((await saldo(p101)) !== 10) throw new Error('101 ' + (await saldo(p101)));
  if ((await saldo(p102)) !== 3) throw new Error('102 ' + (await saldo(p102)));
  const p = await uno(`select estado, entregado_en from comercial.pedidos where id=$1`, [v]);
  if (p.estado !== 'CUMPLIDO' || !p.entregado_en) throw new Error(JSON.stringify(p));
  const r = await uno(
    `select count(*) n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [v],
  );
  if (N(r.n) !== 0) throw new Error('quedan reservas vigentes');
  const d = await uno(`select count(*) n from comercial.despachos_pt where pedido_id=$1`, [v]);
  if (N(d.n) !== 1) throw new Error('despachos ' + d.n);
});
await rechaza(
  'entregado no se despacha de nuevo',
  `select comercial.despachar_pedido_reservado('${v}')`,
  /aprobado|vigente/,
);

await invariantes();
fin();
