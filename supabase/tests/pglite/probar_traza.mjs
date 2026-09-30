import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const f = (await uno(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`, [duo])).id;
await como('naza@x');
const p = (await uno(`insert into comercial.pedidos (numero, cliente) values ('P-1','Ana') returning id`)).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,4,1)`, [p, duo]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
const o = (await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, cantidad_teorica) values ($1,$2,current_date,1) returning id`, [f, duo])).id;
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [p, o]);
await prueba('traza hacia atrás: lote de insumo, recepción y proveedor', async () => {
  await q(`select comercial.terminar_pedido($1)`, [p]);
  const r = await q(`select * from comercial.v_trazabilidad_orden where orden_id=$1 and sentido='INSUMO'`, [o]);
  if (r.length === 0 || !r[0].lote_interno || !r[0].contraparte) throw new Error(JSON.stringify(r));
  console.log('        ', r[0].articulo, r[0].lote_interno, r[0].contraparte);
});
await prueba('lo producido entra con el lote de la orden', async () => {
  const m = await uno(`select orden_id from comercial.movimientos_pt where documento_id=$1 and tipo='ENTRADA_PRODUCCION'`, [p]);
  if (m.orden_id !== o) throw new Error(JSON.stringify(m));
});
await como('silveira@x');
await rechaza('RN-51: un lote sin liberar no se despacha', `select comercial.despachar_pedido('${p}', '[{"producto_id":"${duo}","cantidad":4}]'::jsonb, 'PTF', false)`, /no liberó/);
await rechaza('ni se manda a Calle 5', `select comercial.transferir_pt('${duo}', 1, 'PTF', 'C5')`, /no liberó/);
// Liberada por la DT (el circuito de liberación se prueba en probar_ordenes).
await como(DT);
await db.exec('reset role');
await q(`update gmp.ordenes_produccion set estado='TERMINADA', terminada_por=core.usuario_actual(), terminada_en=now() where id=$1`, [o]);
await q(`update gmp.ordenes_produccion set estado='LIBERADA', liberada_por=core.usuario_actual(), liberada_en=now() where id=$1`, [o]);
await prueba('traza hacia adelante: despacho al cliente', async () => {
  await como('silveira@x');
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'PTF', false)`, [p, JSON.stringify([{ producto_id: duo, cantidad: 4 }])]);
  await db.exec('set constraints all immediate; set constraints all deferred');
  await como('naza@x');
  const r = await q(`select * from comercial.v_trazabilidad_orden where orden_id=$1 and sentido='DESPACHO'`, [o]);
  if (r.length !== 1 || Number(r[0].cantidad) !== 4 || r[0].contraparte !== 'Ana' || !r[0].lote_interno) throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
