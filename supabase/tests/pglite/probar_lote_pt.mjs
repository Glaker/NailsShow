import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const f = (await uno(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`, [duo])).id;
await como('naza@x');
const pedido = async (numero, cant) => {
  const p = (await uno(`insert into comercial.pedidos (numero, cliente) values ($1,'Ana') returning id`, [numero])).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,$3,1)`, [p, duo, cant]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
  return p;
};
const orden = async (partida) =>
  (await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,$3,1) returning id`, [f, duo, partida])).id;
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
const stock = () => uno(`select saldo, retenido from comercial.v_stock_pt where deposito_id=$1 and producto_id=$2`, [PTF, duo]);

const p1 = await pedido('P-1', 4);
const o1 = await orden(1);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [p1, o1]);

await prueba('«Terminado» con orden: entra con su lote, retenido hasta que la DT libere', async () => {
  await q(`select comercial.terminar_pedido($1)`, [p1]);
  const s = await stock();
  if (N(s.saldo) !== 4 || N(s.retenido) !== 4) throw new Error(JSON.stringify(s));
  const l = await uno(`select numero_lote, impedimento from comercial.v_stock_pt_lotes where orden_id=$1`, [o1]);
  if (!l.numero_lote || !/no está liberado/.test(l.impedimento)) throw new Error(JSON.stringify(l));
});
await prueba('lo contado sin lote entra sin lote (R-09)', async () => {
  await q(`select comercial.registrar_conteo_pt($1, 14)`, [duo]);
  const s = await stock();
  if (N(s.saldo) !== 14 || N(s.retenido) !== 4) throw new Error(JSON.stringify(s));
});

await como('silveira@x');
await prueba('se despacha primero lo sin lote', async () => {
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'PTF', false)`, [p1, JSON.stringify([{ producto_id: duo, cantidad: 4 }])]);
  const m = await q(`select orden_id, cantidad from comercial.movimientos_pt where documento_id=$1 and tipo='SALIDA_VENTA'`, [p1]);
  if (m.length !== 1 || m[0].orden_id !== null || N(m[0].cantidad) !== -4) throw new Error(JSON.stringify(m));
});
await como('naza@x');
const p2 = await pedido('P-2', 12);
await como('silveira@x');
await rechaza('RN-51: lo retenido no se vende aunque haya stock', `select comercial.despachar_pedido('${p2}', '[{"producto_id":"${duo}","cantidad":8}]'::jsonb, 'PTF', true)`, /solo 6 se pueden vender/);
await prueba('a Calle 5 va lo sin lote', async () => {
  await q(`select comercial.transferir_pt($1, 6, 'PTF', 'C5')`, [duo]);
});
await rechaza('lo retenido no va a Calle 5', `select comercial.transferir_pt('${duo}', 1, 'PTF', 'C5')`, /no liberó/);
await rechaza('una transferencia no se inserta suelta', `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, documento_tipo) values ('${duo}','${PTF}','TRANSFERENCIA_ENTRE_DEPOSITOS',-1,'TRANSFERENCIA_PT')`, /transferir_pt|row-level/);

await como('naza@x');
await prueba('un ajuste de menos sale de cualquier lote', async () => {
  await q(`select comercial.registrar_conteo_pt($1, 3)`, [duo]);
  const m = await uno(`select orden_id, cantidad from comercial.movimientos_pt where documento_tipo='CONTEO_PT' and cantidad < 0`);
  if (m.orden_id !== o1 || N(m.cantidad) !== -1) throw new Error(JSON.stringify(m));
});

await como(DT);
await db.exec('reset role');
await q(`update gmp.ordenes_produccion set estado='TERMINADA', terminada_por=core.usuario_actual(), terminada_en=now() where id=$1`, [o1]);
await q(`update gmp.ordenes_produccion set estado='LIBERADA', liberada_por=core.usuario_actual(), liberada_en=now() where id=$1`, [o1]);
await como('silveira@x');
await prueba('liberado por la DT, sale y va a Calle 5', async () => {
  await q(`select comercial.transferir_pt($1, 1, 'PTF', 'C5')`, [duo]);
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'PTF', true)`, [p2, JSON.stringify([{ producto_id: duo, cantidad: 2 }])]);
  const s = await stock();
  if (N(s.saldo) !== 0 || N(s.retenido) !== 0) throw new Error(JSON.stringify(s));
});

await como('naza@x');
const p3 = await pedido('P-3', 2);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2), ($1,$3)`, [p3, await orden(2), await orden(3)]);
await rechaza('dos órdenes del mismo producto: «Terminado» pide cuál', `select comercial.terminar_pedido('${p3}')`, /2 órdenes de este producto/);

await invariantes();
fin();
