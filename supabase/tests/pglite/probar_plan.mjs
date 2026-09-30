import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
await como('mati@x');
const p = (await uno(`insert into comercial.pedidos (numero, cliente) values ('P-1','Ana') returning id`)).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,5,1)`, [p, duo]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
await rechaza('Ventas no planifica', `update comercial.pedidos set plan_inicio=current_date, plan_dias=2 where id='${p}'`, /Gerencia de Producción/);
await como('naza@x');
await prueba('Producción planifica y replanifica', async () => {
  await q(`update comercial.pedidos set plan_inicio=current_date + 1, plan_dias=3 where id=$1`, [p]);
  await q(`update comercial.pedidos set plan_dias=4 where id=$1`, [p]);
  const r = await uno(`select plan_dias from comercial.pedidos where id=$1`, [p]);
  if (r.plan_dias !== 4) throw new Error(JSON.stringify(r));
});
await rechaza('plan a medias', `update comercial.pedidos set plan_dias=null where id='${p}'`, /plan_completo/);
await rechaza('más de 60 días', `update comercial.pedidos set plan_dias=61 where id='${p}'`, /check/);
await prueba('Ventas sigue editando otros datos del pedido planificado', async () => {
  await como('mati@x');
  await q(`update comercial.pedidos set observaciones='urgente' where id=$1`, [p]);
});
await invariantes();
fin();
