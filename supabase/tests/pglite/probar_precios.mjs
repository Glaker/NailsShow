import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('op@x', 'OPERARIO');
const N = (x) => Number(x ?? 0);
await como('mati@x');
const p80 = (await uno(`select id from gmp.productos where codigo_interno='80'`)).id;
await prueba('carga inicial: 444 precios vigentes, 80 a $4565 con IVA', async () => {
  const n = await uno(`select count(*)::int n from comercial.v_precios_vigentes`);
  const p = await uno(`select precio_lista, precio_neto, cargado_por from comercial.v_precios_vigentes where producto_id=$1`, [p80]);
  if (n.n !== 444 || N(p.precio_lista) !== 4565 || N(p.precio_neto) !== 3772.73 || !p.cargado_por) throw new Error(JSON.stringify({ n, p }));
});
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Mayorista SA','CONSUMIDOR_FINAL','DNI','30111222') returning id`)).id;
await prueba('descuento general del 35 % (mayorista con factura)', async () => {
  await q(`insert into comercial.descuentos_cliente (cliente_id, porcentaje, motivo) values ($1, 35, 'mayorista')`, [cli]);
  const r = await uno(`select * from comercial.precio_para($1, $2)`, [p80, cli]);
  // La planilla: mayorista c/fac = 4565 × 0,65 / 1,21 = 2452,27
  if (N(r.descuento) !== 35 || N(r.precio_neto) !== 2452.27) throw new Error(JSON.stringify(r));
});
await prueba('el descuento del producto gana sobre el general; 0 % lo quita', async () => {
  await q(`insert into comercial.descuentos_cliente (cliente_id, producto_id, porcentaje) values ($1, $2, 40)`, [cli, p80]);
  let r = await uno(`select descuento from comercial.precio_para($1, $2)`, [p80, cli]);
  if (N(r.descuento) !== 40) throw new Error(JSON.stringify(r));
  await q(`insert into comercial.descuentos_cliente (cliente_id, producto_id, porcentaje) values ($1, $2, 0)`, [cli, p80]);
  r = await uno(`select descuento from comercial.precio_para($1, $2)`, [p80, cli]);
  if (N(r.descuento) !== 35) throw new Error(JSON.stringify(r));
});
let ped;
await prueba('el renglón sin precio toma el sugerido; uno escrito a mano se respeta', async () => {
  ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-1','Mayorista SA',$1) returning id`, [cli])).id;
  const r = await uno(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,2) returning precio_unitario`, [ped, p80]);
  if (N(r.precio_unitario) !== 2452.27) throw new Error(JSON.stringify(r));
  const p81 = (await uno(`select id from gmp.productos where codigo_interno='81'`)).id;
  const r2 = await uno(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,1,100) returning precio_unitario`, [ped, p81]);
  if (N(r2.precio_unitario) !== 100) throw new Error(JSON.stringify(r2));
});
await prueba('cambiar el precio es una versión nueva; la anterior queda', async () => {
  await q(`insert into comercial.precios_producto (producto_id, precio_lista, motivo) values ($1, 5000, 'aumento')`, [p80]);
  const v = await uno(`select precio_lista from comercial.v_precios_vigentes where producto_id=$1`, [p80]);
  const n = await uno(`select count(*)::int n from comercial.precios_producto where producto_id=$1`, [p80]);
  if (N(v.precio_lista) !== 5000 || n.n !== 2) throw new Error(JSON.stringify({ v, n }));
});
await prueba('aplicar precios al pedido en borrador (pisa los manuales)', async () => {
  const n = await uno(`select comercial.aplicar_precios_pedido($1) n`, [ped]);
  const r = await uno(`select precio_unitario from comercial.pedido_renglones where pedido_id=$1 and producto_id=$2`, [ped, p80]);
  if (N(n.n) !== 2 || N(r.precio_unitario) !== Math.round((5000 / 1.21) * 0.65 * 100) / 100) throw new Error(JSON.stringify({ n, r }));
});
await rechaza('un precio no se edita', `update comercial.precios_producto set precio_lista = 1`, /permission denied/);
await rechaza('precio cero', `insert into comercial.precios_producto (producto_id, precio_lista) values ('${p80}', 0)`, /check/);
await como('op@x');
await rechaza('un operario no cambia precios', `insert into comercial.precios_producto (producto_id, precio_lista) values ('${p80}', 1)`, /row-level/);
await rechaza('ni descuentos', `insert into comercial.descuentos_cliente (cliente_id, porcentaje) values ('${cli}', 90)`, /row-level/);
await invariantes();
fin();
