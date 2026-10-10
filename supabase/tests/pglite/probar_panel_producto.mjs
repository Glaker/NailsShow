// Fase 2 del módulo de costos (20261009130000): foto mensual, historia de
// precios por banda y stock valorizado.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('oper@x', 'OPERARIO');
const N = (x) => (x == null ? null : Number(x));

await como('gaby@x');
await prueba('la foto del mes cubre todos los productos activos; repetirla sin cambios no escribe', async () => {
  const a = await uno(`select comercial.tomar_foto_costos() n`);
  const p = await uno(`select count(*)::int n from gmp.productos where activo`);
  if (a.n !== p.n) throw new Error(JSON.stringify({ a, p }));
  const b = await uno(`select comercial.tomar_foto_costos() n`);
  if (b.n !== 0) throw new Error('reescribió ' + b.n);
});
await prueba('un cambio de costo actualiza sólo la foto del mes en curso', async () => {
  await q(`insert into comercial.parametros_costo (costo_hora) values (6000)`);
  const pid = (await uno(`select id from gmp.productos where activo order by codigo_interno limit 1`)).id;
  await q(`insert into comercial.minutos_producto (producto_id, minutos_por_unidad) values ($1, 2)`, [pid]);
  const n = await uno(`select comercial.tomar_foto_costos() n`);
  const f = await uno(`select mano_de_obra from comercial.fotos_costo_producto where producto_id=$1`, [pid]);
  if (n.n < 1 || N(f.mano_de_obra) !== 200) throw new Error(JSON.stringify({ n, f }));
});
const rechazaCon = (nombre, sql, patron) => prueba(nombre, async () => {
  await db.exec('savepoint x');
  try {
    await db.exec(sql);
    throw new Error('no rechazó');
  } catch (e) {
    if (!patron.test(e.message)) throw e;
  } finally {
    await db.exec('rollback to savepoint x');
  }
});
await rechazaCon('nadie carga la foto a mano por la API, ni del mes en curso',
  `insert into comercial.fotos_costo_producto (mes, producto_id, faltantes, detalle, costo_unitario) select date_trunc('month', comercial.hoy())::date, id, 0, '[]', 1 from gmp.productos where activo limit 1 on conflict (mes, producto_id) do update set costo_unitario = 1`,
  /no se carga a mano/);
await rechazaCon('ni con la marca: un mes cerrado no se escribe',
  `select set_config('comercial.tomando_foto','si',true); insert into comercial.fotos_costo_producto (mes, producto_id, faltantes, detalle) select date_trunc('month', comercial.hoy())::date - interval '1 month', id, 0, '[]' from gmp.productos limit 1`,
  /mes cerrado/);
await rechazaCon('ni se mueve una foto del mes en curso a otro mes',
  `select set_config('comercial.tomando_foto','si',true); update comercial.fotos_costo_producto set mes = mes - interval '1 month' where mes = date_trunc('month', comercial.hoy())::date`,
  /mes cerrado/);

await prueba('historia de precios: consumidor final neto del producto 80', async () => {
  const pid = (await uno(`select id from gmp.productos where codigo_interno='80'`)).id;
  const h = await q(`select * from comercial.historia_precios($1, 3) where banda='CONSUMIDOR_FINAL' order by mes desc`, [pid]);
  // Lista 4565 con IVA 21 % → 3772,7273 neto.
  if (!h.length || Math.abs(N(h[0].precio_neto) - 3772.7273) > 0.001) throw new Error(JSON.stringify(h));
});
await prueba('historia de precios: bandas mayoristas netas', async () => {
  const l = await uno(`select producto_id, precio_lista, precio_promo, alicuota_iva from comercial.v_lista_mayorista where not es_regalo and precio_promo > 0 limit 1`);
  const h = await q(`select banda, precio_neto from comercial.historia_precios($1, 1)`, [l.producto_id]);
  const may = h.find((x) => x.banda === 'MAYORISTA');
  const pro = h.find((x) => x.banda === 'MAYORISTA_PROMO');
  const div = 1 + N(l.alicuota_iva) / 100;
  if (Math.abs(N(may.precio_neto) - N(l.precio_lista) / div) > 0.001 || Math.abs(N(pro.precio_neto) - N(l.precio_promo) / div) > 0.001)
    throw new Error(JSON.stringify({ l, h }));
});

await prueba('stock valorizado de insumos: saldo del lote × costo del lote', async () => {
  const r = await q(`select * from comercial.v_stock_valorizado_insumos where valor_ars is not null limit 20`);
  if (!r.length) throw new Error('sin lotes valorizados');
  for (const x of r)
    if (Math.abs(N(x.valor_ars) - N(x.saldo_unidad_catalogo) * N(x.costo_unitario_ars)) > 0.01) throw new Error(JSON.stringify(x));
});
await prueba('stock valorizado de producto terminado responde', async () => {
  await q(`select * from comercial.v_stock_valorizado_pt limit 5`);
});

await como('oper@x');
await prueba('un operario no toma fotos ni ve stock valorizado', async () => {
  const n = await uno(`select comercial.tomar_foto_costos() n`);
  const f = await uno(`select count(*)::int n from comercial.fotos_costo_producto`);
  const v = await uno(`select count(*) filter (where valor_ars is not null)::int n from comercial.v_stock_valorizado_insumos`);
  if (n.n !== 0 || f.n !== 0 || v.n !== 0) throw new Error(JSON.stringify({ n, f, v }));
});

await invariantes();
fin();
