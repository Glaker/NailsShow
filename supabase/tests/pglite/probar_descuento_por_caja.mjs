// Descuento por caja (20261102130000, D-descuento-caja-1): marcado en el
// renglón, se aplica sobre el precio con el descuento del pedido y se suma a
// él. La lista de cajas de Ventas da sus precios finales.
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const mono = await prod('101');
const aceite = await prod('381');

await prueba('carga: 35 productos; el monómero 100 ml en caja de 98 al 5 %', async () => {
  const n = await uno(`select count(*)::int n from comercial.v_descuentos_caja`);
  const c = await uno(`select * from comercial.v_descuentos_caja where producto_id=$1`, [
    mono,
  ]);
  if (n.n !== 35 || c.unidades_caja !== 98 || N(c.porcentaje) !== 5)
    throw new Error(JSON.stringify({ n, c }));
});

await como('mati@x');
const venta = async (n, desc = null) =>
  (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta, descuento_pct, deposito_origen_id)
       values ($1,'Cliente caja',true,$2,(select id from gmp.depositos where numero='PTF')) returning id`,
      [n, desc],
    )
  ).id;
const renglon = (p, producto, cant, caja = null) =>
  uno(
    `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, descuento_caja_pct)
     values ($1,$2,$3,$4) returning id`,
    [p, producto, cant, caja],
  );
const precio = async (id) =>
  N((await uno(`select precio_final from comercial.pedido_renglones where id=$1`, [id])).precio_final);

await prueba('caja de monómero sin otro descuento: 98 × 8.075 = 791.350', async () => {
  const p = await venta('V-C1', 0);
  const r = await renglon(p, mono, 98, 5);
  if ((await precio(r.id)) !== 8075) throw new Error(String(await precio(r.id)));
});
await prueba('aceite de cutícula al 8 %: 91 × 2.300 = 209.300', async () => {
  const p = await venta('V-C2', 0);
  const r = await renglon(p, aceite, 91, 8);
  if ((await precio(r.id)) * 91 !== 209300) throw new Error(String(await precio(r.id)));
});
await prueba('se suma al del pedido: 8.500 × 0,80 = 6.800, × 0,95 = 6.460', async () => {
  const p = await venta('V-C3', 20);
  const r = await renglon(p, mono, 98, 5);
  if ((await precio(r.id)) !== 6460) throw new Error(String(await precio(r.id)));
});
await prueba('Ventas lo cambia o lo saca y el precio se recalcula', async () => {
  const p = await venta('V-C4', 0);
  const r = await renglon(p, mono, 98, 5);
  await q(`update comercial.pedido_renglones set descuento_caja_pct = 10 where id=$1`, [r.id]);
  if ((await precio(r.id)) !== 7650) throw new Error('10 %: ' + (await precio(r.id)));
  await q(`update comercial.pedido_renglones set descuento_caja_pct = null where id=$1`, [r.id]);
  if ((await precio(r.id)) !== 8500) throw new Error('sin: ' + (await precio(r.id)));
});
await rechaza(
  'más de 100 % no',
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, descuento_caja_pct)
   values ((select id from comercial.pedidos where numero='V-C1'), '${aceite}', 1, 101)`,
  /check/,
);
await prueba('Ventas carga un porcentaje nuevo y rige el último', async () => {
  await q(
    `insert into comercial.descuentos_caja (producto_id, unidades_caja, porcentaje) values ($1, 98, 7)`,
    [mono],
  );
  const c = await uno(`select porcentaje from comercial.v_descuentos_caja where producto_id=$1`, [
    mono,
  ]);
  if (N(c.porcentaje) !== 7) throw new Error(JSON.stringify(c));
});
await rechaza(
  'no se edita',
  `update comercial.descuentos_caja set porcentaje = 1`,
  /permission denied/,
);

await como('naza@x');
await rechaza(
  'Gerencia de Producción no carga descuentos de caja',
  `insert into comercial.descuentos_caja (producto_id, unidades_caja, porcentaje) values ('${mono}', 98, 1)`,
  /row-level security/,
);

await invariantes();
fin();
