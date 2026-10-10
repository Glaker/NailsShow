// D-42 (20261010120000 y 20261010120100): costo de la planilla de apertura
// como lo definió Finanzas, IVA en el costo de referencia, corte y pendientes.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION', 'PRODUCCION');
const H = 'b'.repeat(64);
const ref = (codigo) => uno(`select * from comercial.v_costo_referencia where codigo_interno = $1`, [codigo]);
const cerca = (a, b) => Math.abs(Number(a) - b) < 1e-4;

await invariantes();
await como('gaby@x');

await prueba('un polvo de 1 kg: el «Unitario» es el precio de la presentación', async () => {
  const r = await ref('080POL');
  // 49.734,9083 por 1 kg → por g (unidad del catálogo).
  if (r.origen !== 'APERTURA' || !cerca(r.costo_unitario_ars, 49.734908) || r.pendiente !== null)
    throw new Error(JSON.stringify(r));
});
await prueba('la carga anterior queda en la historia, rectificada con motivo', async () => {
  const r = await uno(`
    select o.tipo_cambio as viejo, n.tipo_cambio as nuevo, n.motivo
      from comercial.costos_lote n
      join comercial.costos_lote o on o.id = n.rectifica_a
      join gmp.lotes_insumo l on l.id = n.lote_insumo_id
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where i.codigo_interno = '080ENV'`);
  if (!r || r.viejo === null || r.nuevo !== null || !/presentación/.test(r.motivo)) throw new Error(JSON.stringify(r));
});
await prueba('un insumo en UNIDAD que ya estaba bien no se rectifica', async () => {
  const r = await uno(`
    select count(*)::int n from comercial.costos_lote c
      join gmp.lotes_insumo l on l.id = c.lote_insumo_id
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where i.codigo_interno = '111ET'`);
  const sinCambio = await uno(`
    select count(*)::int n from comercial.costos_lote c
     where c.origen = 'APERTURA' and c.rectifica_a is null
       and not exists (select 1 from comercial.costos_lote r where r.rectifica_a = c.id)`);
  if (r.n < 1 || sinCambio.n === 0) throw new Error(JSON.stringify({ r, sinCambio }));
});
await prueba('en dólares, sin serie cargada: pendiente por falta de tipo de cambio', async () => {
  const r = await ref('080ENV');
  if (r.costo_unitario_ars !== null || !/tipo de cambio/.test(r.pendiente ?? '')) throw new Error(JSON.stringify(r));
});
await prueba('en dólares se guarda el monto en U$D y la fecha, sin tipo de cambio propio', async () => {
  const r = await uno(`
    select c.importe, c.moneda, c.tipo_cambio, c.fecha_costo from comercial.costos_lote c
      join gmp.lotes_insumo l on l.id = c.lote_insumo_id
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where i.codigo_interno = '080ENV'
       and not exists (select 1 from comercial.costos_lote x where x.rectifica_a = c.id)`);
  // 323 U$D por 1000 envases.
  if (!cerca(r.importe, 0.323) || r.moneda !== 'USD' || r.tipo_cambio !== null || !r.fecha_costo)
    throw new Error(JSON.stringify(r));
});
await prueba('con la serie cargada se convierte con el tipo de cambio activo y dice cuál', async () => {
  await q(`insert into comercial.series_macro (serie, mes, valor, fuente) values
           ('TC_A3500_PROMEDIO', '2026-09-01', 1400, 'BCRA'), ('TC_A3500_CIERRE', '2026-09-01', 1500, 'BCRA'),
           ('TC_A3500_CIERRE', '2026-08-01', 1300, 'BCRA')`);
  const r = await ref('080ENV');
  if (!cerca(r.costo_unitario_ars, 484.5) || Number(r.tipo_cambio_aplicado) !== 1500 || r.tipo_cambio_mes === null)
    throw new Error(JSON.stringify(r));
});
await prueba('un costo de 2023 lleva DESACTUALIZADO; sin fecha también', async () => {
  const viejo = await ref('080ENV');
  const sinFecha = await ref('080POL');
  if (viejo.desactualizado !== true || sinFecha.desactualizado !== true) throw new Error(JSON.stringify({ viejo, sinFecha }));
});
await prueba('el corte lo edita Finanzas y cambia la etiqueta', async () => {
  await q(`insert into comercial.parametros_costo (corte_apertura) values ('2023-01-01')`);
  const r = await ref('080ENV');
  const p = await uno(`select corte_apertura, umbral_variacion from comercial.v_parametros_costo`);
  if (r.desactualizado !== false || String(p.corte_apertura).slice(0, 4) !== '2023' && !(p.corte_apertura instanceof Date))
    throw new Error(JSON.stringify({ r, p }));
  if (Number(p.umbral_variacion) !== 0.05) throw new Error('el corte reseteó otro parámetro');
});
await prueba('un líquido sin cantidad de la presentación queda pendiente y sin costo', async () => {
  const r = await ref('370CREMA');
  const p = await uno(`select importe, peso_planilla from comercial.costos_apertura_pendientes p
                         join gmp.insumos_catalogo i on i.id = p.insumo_id where i.codigo_interno = '370CREMA'`);
  if (r.costo_unitario_ars !== null || r.pendiente !== 'Falta la cantidad de la presentación' || !p)
    throw new Error(JSON.stringify({ r, p }));
});
await prueba('su costo anterior se anuló con una fila sin importe', async () => {
  const r = await q(`
    select c.importe, c.motivo from comercial.costos_lote c
      join gmp.lotes_insumo l on l.id = c.lote_insumo_id
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where i.codigo_interno = '370CREMA' and c.rectifica_a is not null`);
  if (r.length && (r[0].importe !== null || !/cantidad/.test(r[0].motivo))) throw new Error(JSON.stringify(r));
});
await prueba('presentación en litros de un insumo en gramos sin densidad: pendiente por densidad', async () => {
  const r = await ref('135FRA1');
  if (r.costo_unitario_ars !== null || !/densidad/i.test(r.pendiente ?? '')) throw new Error(JSON.stringify(r));
});
await prueba('el Excel de pendientes trae lo que dice la planilla', async () => {
  const r = await q(`select codigo_interno, pendiente, importe, moneda, cantidad, unidad from comercial.v_costos_pendientes`);
  const crema = r.find((x) => x.codigo_interno === '370CREMA');
  const fra = r.find((x) => x.codigo_interno === '135FRA1');
  if (!crema || crema.cantidad !== null || !fra || Number(fra.cantidad) !== 1000 || fra.unidad !== 'ml')
    throw new Error(JSON.stringify({ crema, fra, n: r.length }));
});
await prueba('un producto con un insumo pendiente dice por qué en el desglose', async () => {
  const r = await uno(`
    select c.falta from comercial.costos_productos() c
      join gmp.insumos_catalogo i on i.id = c.insumo_id
     where i.codigo_interno = '135FRA1' limit 1`);
  if (r && !/densidad/i.test(r.falta ?? '')) throw new Error(JSON.stringify(r));
});
await prueba('el costo de referencia manual se carga con IVA y costea neto', async () => {
  await q(`insert into comercial.costos_referencia (insumo_id, importe, incluye_iva, alicuota_iva, cantidad, unidad)
           select id, 1210, true, 21, 1, 'kg' from gmp.insumos_catalogo where codigo_interno = '080POL'`);
  const r = await ref('080POL');
  if (r.origen !== 'MANUAL' || !cerca(r.costo_unitario_ars, 1) || r.desactualizado !== false || r.pendiente !== null)
    throw new Error(JSON.stringify(r));
});
await rechaza('con IVA incluido va la alícuota', `insert into comercial.costos_referencia (insumo_id, importe, incluye_iva, unidad)
  select id, 100, true, 'kg' from gmp.insumos_catalogo where codigo_interno = '080POL'`, /costos_referencia_iva/);
await prueba('un precio con IVA se puede dar de baja (la columna derivada no cuenta como edición)', async () => {
  await q(`update comercial.costos_referencia set vigente_hasta = comercial.hoy() where incluye_iva`);
});
await prueba('Finanzas completa un pendiente reimportando la plantilla', async () => {
  const n = await uno(`select comercial.importar_costos_referencia('pendientes.xlsx', $1, $2::jsonb) n`, [H, JSON.stringify([
    { codigo_insumo: '370CREMA', importe: 12100, incluye_iva: 'SI', alicuota: 21, cantidad: 1, unidad: 'kg', moneda: 'ARS', vigente_desde: '2024-05-01' },
  ])]);
  const r = await ref('370CREMA');
  if (n.n !== 1 || r.pendiente !== null || !cerca(r.costo_unitario_ars, 10) || r.desactualizado !== false)
    throw new Error(JSON.stringify({ n, r }));
  const p = await q(`select 1 from comercial.v_costos_pendientes where codigo_interno = '370CREMA'`);
  if (p.length) throw new Error('sigue en pendientes');
});
await rechaza('incluye_iva sólo SI o NO', `select comercial.importar_costos_referencia('x.xlsx', '${H}', '[{"codigo_insumo":"080POL","importe":1,"unidad":"kg","incluye_iva":"si"}]'::jsonb)`, /SI o NO/);
await rechaza('SI sin alícuota dice el renglón', `select comercial.importar_costos_referencia('x.xlsx', '${H}', '[{"codigo_insumo":"080POL","importe":1,"unidad":"kg","incluye_iva":"SI"}]'::jsonb)`, /Renglón 1.*alícuota/);
await rechaza('sin importe sólo una rectificación de apertura', `insert into comercial.costos_lote (lote_insumo_id, origen, importe, moneda, cantidad, unidad)
  select l.id, 'APERTURA', null, 'ARS', 1, 'g' from gmp.lotes_insumo l where l.migracion_apertura_id is not null
   and not exists (select 1 from comercial.costos_lote c where c.lote_insumo_id = l.id) limit 1`, /costos_lote_anulacion|null value|lote/);
await rechaza('un costo en pesos sin tipo de cambio no pasa el CHECK (NULL no cuenta como cumplido)', `insert into comercial.costos_lote (lote_insumo_id, origen, importe, moneda, tipo_cambio, cantidad, unidad, rectifica_a, motivo)
  select c.lote_insumo_id, 'APERTURA', 1, 'ARS', null, 1, c.unidad, c.id, 'prueba' from comercial.costos_lote c
   where c.origen = 'APERTURA' and not exists (select 1 from comercial.costos_lote r where r.rectifica_a = c.id) limit 1`, /costos_lote_tipo_cambio/);
await prueba('los dólares incoherentes con el unitario en pesos quedan pendientes, no cargados', async () => {
  const r = await q(`select i.codigo_interno, p.motivo from comercial.costos_apertura_pendientes p
                       join gmp.insumos_catalogo i on i.id = p.insumo_id where p.motivo = 'DOLAR_A_REVISAR'`);
  for (const x of r) {
    const c = await ref(x.codigo_interno);
    if (c && (c.costo_unitario_ars !== null && c.origen === 'APERTURA')) throw new Error(JSON.stringify(c));
  }
  console.log('        (dólares a revisar en el catálogo:', r.map((x) => x.codigo_interno).join(', ') || 'ninguno', ')');
});
await rechaza('nadie escribe pendientes a mano', `insert into comercial.costos_apertura_pendientes (insumo_id, importe, moneda)
  select id, 1, 'ARS' from gmp.insumos_catalogo where codigo_interno = '080POL'`, /permission|política|policy/);
await como('naza@x');
await prueba('Gerencia de Producción ve los pendientes', async () => {
  const r = await uno(`select count(*)::int n from comercial.v_costos_pendientes`);
  if (!(r.n > 0)) throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
