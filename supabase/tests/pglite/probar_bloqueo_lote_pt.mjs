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
const p1 = await pedido('P-1', 4);
const o1 = (await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,1,1) returning id`, [f, duo])).id;
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [p1, o1]);
await q(`select comercial.terminar_pedido($1)`, [p1]);
await como(DT);
await db.exec('reset role');
await q(`update gmp.ordenes_produccion set estado='TERMINADA', terminada_por=core.usuario_actual(), terminada_en=now() where id=$1`, [o1]);
await q(`update gmp.ordenes_produccion set estado='LIBERADA', liberada_por=core.usuario_actual(), liberada_en=now() where id=$1`, [o1]);
await como(DT);

await prueba('un lote de producto terminado liberado es despachable', async () => {
  const r = await uno(`select gmp.lote_despachable($1) ok, gmp.impedimento_despacho_orden($1) motivo`, [o1]);
  if (r.ok !== true || r.motivo !== null) throw new Error(JSON.stringify(r));
});
let bloqueo;
await prueba('la DT bloquea el lote (retiro de mercado) y deja de ser despachable', async () => {
  bloqueo = (await uno(`insert into gmp.bloqueos_lote (orden_id, motivo, detalle) values ($1,'RETIRO_MERCADO','prueba de retiro') returning id`, [o1])).id;
  const r = await uno(`select gmp.lote_despachable($1) ok, gmp.impedimento_despacho_orden($1) motivo`, [o1]);
  const v = await uno(`select numero_registro_interno, orden_id from gmp.v_bloqueos_lote where id=$1`, [bloqueo]);
  if (r.ok !== false || !/RN-52/.test(r.motivo) || v.orden_id !== o1 || !v.numero_registro_interno) throw new Error(JSON.stringify({ r, v }));
});
await rechaza('un bloqueo es de un lote de insumo o de uno de producto terminado, no de los dos',
  `insert into gmp.bloqueos_lote (orden_id, motivo, detalle) values (null,'INVESTIGACION','x')`, /bloqueos_lote_un_lote/);

await como('naza@x');
const p2 = await pedido('P-2', 4);
await como('silveira@x');
await rechaza('un lote bloqueado no se despacha', `select comercial.despachar_pedido('${p2}', '[{"producto_id":"${duo}","cantidad":4}]'::jsonb, 'PTF', false)`, /bloqueados|no liberados/);

await como(DT);
await prueba('levantado el bloqueo, el lote sale y la salida lleva su lote', async () => {
  await q(`update gmp.bloqueos_lote set levantado=true, levantado_motivo='retiro descartado' where id=$1`, [bloqueo]);
  await como('silveira@x');
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'PTF', false)`, [p2, JSON.stringify([{ producto_id: duo, cantidad: 4 }])]);
  const m = await q(`select orden_id, cantidad from comercial.movimientos_pt where documento_id=$1 and tipo='SALIDA_VENTA'`, [p2]);
  if (m.length !== 1 || m[0].orden_id !== o1 || N(m[0].cantidad) !== -4) throw new Error(JSON.stringify(m));
});

await invariantes();
fin();
