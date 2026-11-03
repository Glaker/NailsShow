// Caja mixta (20261103120000, D-caja-mixta-1): en el mismo renglón van cajas
// cerradas con descuento y unidades sueltas sin él.
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const N = (x) => Number(x ?? 0);
const mono = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;

await como('mati@x');
const p = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, es_venta, descuento_pct, deposito_origen_id)
     values ('V-M1','Cliente mixto',true,0,(select id from gmp.depositos where numero='PTF')) returning id`,
  )
).id;
const r = await uno(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, descuento_caja_pct, cantidad_caja)
   values ($1,$2,108,5,98) returning id`,
  [p, mono],
);
const fila = () =>
  uno(`select precio_final, precio_unitario, alicuota_iva from comercial.pedido_renglones where id=$1`, [r.id]);

await prueba('1 caja de 98 a 8.075 + 10 sueltas a 8.500: 876.350 / 108 = 8.114,35', async () => {
  const f = await fila();
  if (N(f.precio_final) !== 8114.35) throw new Error(JSON.stringify(f));
  const exacto = 876350 / 108 / (1 + N(f.alicuota_iva) / 100);
  if (Math.abs(N(f.precio_unitario) - exacto) > 0.00005) throw new Error(JSON.stringify(f));
});
await prueba('todo en caja (NULL o = cantidad) da 8.075; ninguna en caja da 8.500', async () => {
  await q(`update comercial.pedido_renglones set cantidad_caja = 108 where id=$1`, [r.id]);
  if (N((await fila()).precio_final) !== 8075) throw new Error('108');
  await q(`update comercial.pedido_renglones set cantidad_caja = null where id=$1`, [r.id]);
  if (N((await fila()).precio_final) !== 8075) throw new Error('null');
  await q(`update comercial.pedido_renglones set cantidad_caja = 0 where id=$1`, [r.id]);
  if (N((await fila()).precio_final) !== 8500) throw new Error('0');
});
await rechaza(
  'no van en caja más unidades que las del renglón',
  `update comercial.pedido_renglones set cantidad_caja = 109 where id='${r.id}'`,
  /renglones_cantidad_caja_tope/,
);

await invariantes();
fin();
