// Fase 3 del módulo de costos (20261009140000): renglones de factura, gastos,
// amortizaciones, mano de obra no absorbida, resultado de gestión y equilibrio.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('oper@x', 'OPERARIO');
const N = (x) => (x == null ? null : Number(x));
const cerca = (a, b, tol = 0.01) => Math.abs(N(a) - b) <= tol;

await invariantes();

// Emisor en producción (como la base de práctica) y una factura autorizada.
await db.exec('reset role');
await q(`update comercial.configuracion_fiscal set vigente = false where vigente`);
await q(`insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, razon_social, condicion_iva)
         values ('PRODUCCION', '30711111111', 9, 'Nail Show SRL (prueba)', 'RESPONSABLE_INSCRIPTO')`);
const autorizar = async (id, numero) => {
  await q(`select comercial.fijar_numero_factura($1, $2)`, [id, numero]);
  const r = { FECAESolicitarResult: { FeCabResp: { Resultado: 'A' }, FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '12345678901234', CAEFchVto: '20261231' }] } } };
  await q(`select comercial.registrar_resultado_factura($1, '{}'::jsonb, $2::jsonb)`, [id, JSON.stringify(r)]);
};

await como('diego@x');
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Belleza SRL','RESPONSABLE_INSCRIPTO','CUIT','30715555553') returning id`)).id;
const [p1, p2] = (await q(`select id from gmp.productos where activo order by codigo_interno limit 2`)).map((r) => r.id);
const ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-R1','Belleza SRL',$1) returning id`, [cli])).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,10,1000), ($1,$3,4,2500)`, [ped, p1, p2]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);
await q(`select comercial.preparar_factura($1)`, [ped]);
const fac = (await uno(`select id, importe_neto from comercial.facturas where pedido_id=$1`, [ped]));

await prueba('al emitir quedan los renglones de lo facturado y suman el neto de la factura', async () => {
  const r = await q(`select producto_id, cantidad, importe_neto from comercial.factura_renglones where factura_id=$1`, [fac.id]);
  const suma = r.reduce((s, x) => s + N(x.importe_neto), 0);
  if (r.length !== 2 || !cerca(suma, N(fac.importe_neto)) || !cerca(suma, 20000)) throw new Error(JSON.stringify({ r, fac }));
});
await rechaza('nadie escribe renglones de factura a mano', `insert into comercial.factura_renglones (factura_id, producto_id, cantidad, precio_unitario, alicuota_iva, importe_neto) values ('${fac.id}','${p1}',1,1,21,1)`, /permission|privilegi/);

await como('diego@x');
await autorizar(fac.id, 501);
const mes = (await uno(`select date_trunc('month', fecha)::date::text m from comercial.facturas where id=$1`, [fac.id])).m;

await prueba('ventas por producto y mes, de facturas autorizadas', async () => {
  await como('gaby@x');
  const v = await q(`select producto_id, unidades, facturacion from comercial.v_ventas_producto_mes where mes=$1`, [mes]);
  const a = v.find((x) => x.producto_id === p1);
  if (v.length !== 2 || N(a.unidades) !== 10 || N(a.facturacion) !== 10000) throw new Error(JSON.stringify(v));
});

// Costo: foto del mes con costo y mano de obra conocidos (la carga la dueña,
// como la historia de práctica).
await db.exec('reset role');
for (const [p, costo, mo] of [[p1, 400, 50], [p2, 1000, 100]])
  await q(`insert into comercial.fotos_costo_producto (mes, producto_id, costo_unitario, mano_de_obra, faltantes, detalle)
           values ($1, $2, $3, $4, 0, '[]') on conflict (mes, producto_id) do update set costo_unitario = excluded.costo_unitario, mano_de_obra = excluded.mano_de_obra`,
          [mes, p, costo, mo]);

await como('naza@x');
const cat = async (nombre) => (await uno(`select id from comercial.categorias_gasto where nombre=$1`, [nombre])).id;
await rechaza('Gerencia de Producción no carga costos fijos', `insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe) values ('${await cat('Alquiler')}','${mes}','Alquiler','SIN_COMPROBANTE',1)`, /row-level|policy/);
await prueba('Gerencia de Producción carga un gasto operativo sin comprobante', async () => {
  await q(`insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe) values ($1,$2,'Artículos de limpieza','SIN_COMPROBANTE',1000)`, [await cat('Limpieza'), mes]);
});
await rechaza('una inversión sin vida útil', `insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe) values ('${await cat('Maquinaria')}','${mes}','Envasadora','SIN_COMPROBANTE',1)`, /vida útil/);

await como('gaby@x');
await prueba('una inversión se amortiza en partes iguales: no pega entera en el mes', async () => {
  await q(`insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe, incluye_iva, alicuota_iva, vida_util_meses)
           values ($1,$2,'Envasadora','FACTURA_A',2904000,true,21,24)`, [await cat('Maquinaria'), mes]);
  const a = await q(`select mes, cuota from comercial.v_amortizaciones where descripcion='Envasadora' order by mes`);
  // 2.904.000 con IVA = 2.400.000 neto / 24 = 100.000 por mes.
  if (a.length !== 24 || !cerca(a[0].cuota, 100000)) throw new Error(JSON.stringify(a.slice(0, 2)));
});
await prueba('costos fijos, nómina de producción y resultado del mes', async () => {
  await q(`insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe) values
           ($1,$3,'Alquiler planta','SIN_COMPROBANTE',3000), ($2,$3,'Sueldos de planta','SIN_COMPROBANTE',1500)`,
          [await cat('Alquiler'), await cat('Nómina de producción'), mes]);
  const r = await uno(`select * from comercial.v_resultado_gestion where mes=$1`, [mes]);
  // Ventas 20.000. Costo variable: 10 × 400 + 4 × 1.000 = 8.000. MC = 12.000 (60 %).
  // MO vendida: 10 × 50 + 4 × 100 = 900 → no absorbida 1.500 − 900 = 600.
  // Estructura: fijos 3.000 + 600 + operativos 1.000 + amortización 100.000 = 104.600.
  // Resultado = 20.000 − 8.000 − 104.600 = −92.600.
  // Equilibrio (D-48, nómina fija): (3.000 + 1.500 + 1.000 + 100.000) / ((12.000 + 900) / 20.000) = 163.565,89.
  const esperado = { facturacion: 20000, costo_variable: 8000, margen_contribucion: 12000, costos_fijos: 3000,
    mano_de_obra_no_absorbida: 600, gastos_operativos: 1000, amortizaciones: 100000, costos_estructura: 104600,
    resultado: -92600, facturacion_equilibrio: 163565.89 };
  for (const [k, v] of Object.entries(esperado)) if (!cerca(r[k], v)) throw new Error(`${k}: ${r[k]} ≠ ${v}`);
  if (!cerca(r.margen_contribucion_pct, 0.6, 1e-6)) throw new Error(String(r.margen_contribucion_pct));
});
await prueba('el resultado mensual de Administración toma los gastos de comercial.gastos (D-46)', async () => {
  const r = await uno(`select otros_egresos from comercial.v_resultado_mensual where periodo=$1`, [mes]);
  // Operativos 1.000 + fijos 3.000 + nómina 1.500 + amortización 100.000.
  if (!cerca(r.otros_egresos, 105500)) throw new Error(JSON.stringify(r));
});
await rechaza('un gasto no se edita', `update comercial.gastos set importe = 1`, /permission|privilegi/);
await prueba('rectificar un gasto con importe 0 lo quita del resultado', async () => {
  const g = (await uno(`select id, categoria_id from comercial.gastos where descripcion='Alquiler planta'`));
  await q(`insert into comercial.gastos (categoria_id, mes, descripcion, tipo_comprobante, importe, rectifica_a, motivo)
           values ($1,$2,'Alquiler planta','SIN_COMPROBANTE',0,$3,'Cargado dos veces')`, [g.categoria_id, mes, g.id]);
  const r = await uno(`select costos_fijos from comercial.v_resultado_gestion where mes=$1`, [mes]);
  if (!cerca(r.costos_fijos, 0)) throw new Error(JSON.stringify(r));
});

await prueba('la nota de crédito copia los renglones y resta en las ventas', async () => {
  await como('diego@x');
  await q(`select comercial.preparar_nota_credito($1, 'Devolución total')`, [fac.id]);
  const nc = (await uno(`select id from comercial.facturas where factura_asociada_id=$1`, [fac.id])).id;
  const r = await uno(`select count(*)::int n from comercial.factura_renglones where factura_id=$1`, [nc]);
  await autorizar(nc, 1);
  await como('gaby@x');
  const v = await uno(`select coalesce(sum(facturacion),0) f from comercial.v_ventas_producto_mes where mes=$1`, [mes]);
  if (r.n !== 2 || !cerca(v.f, 0)) throw new Error(JSON.stringify({ r, v }));
});

await como('oper@x');
await prueba('un operario no ve gastos ni resultado', async () => {
  const g = await uno(`select count(*)::int n from comercial.gastos`);
  const r = await q(`select * from comercial.v_resultado_gestion`);
  if (g.n !== 0 || r.length !== 0) throw new Error(JSON.stringify({ g, r: r.length }));
});

await invariantes();
fin();
