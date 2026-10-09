// Fase 1 del módulo de costos (20261009120000 a 20261009120400).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('vir@x', 'GERENCIA', 'ADMINISTRACION');
await usuario('oper@x', 'OPERARIO');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const N = (x) => (x == null ? null : Number(x));
const cerca = (a, b, tol = 1e-6) => Math.abs(N(a) - b) <= tol;

await invariantes();

await como('gaby@x');
await prueba('apertura: envase en USD, unitario y moneda original guardados', async () => {
  const c = await uno(`select * from comercial.v_costos_lote_unitario where codigo_interno='080ENV' and origen='APERTURA'`);
  // Planilla: U$D 323 / $497.420 por 1000 unidades → $497,42 la unidad, TC 1540.
  if (c.moneda !== 'USD' || N(c.tipo_cambio) !== 1540 || !cerca(c.costo_unitario_ars, 497.42, 0.01) || c.fecha_costo === null)
    throw new Error(JSON.stringify(c));
});
await prueba('apertura: materia prima en ml toma el unitario de la planilla por litro', async () => {
  const r = await uno(`select * from comercial.v_costo_referencia where codigo_interno='101ESE'`);
  // $17.700 el litro → $17,70 el ml, origen APERTURA.
  if (r.origen !== 'APERTURA' || !cerca(r.costo_unitario_ars, 17.7)) throw new Error(JSON.stringify(r));
});

await prueba('operario y ventas no ven costos', async () => {
  for (const e of ['oper@x', 'mati@x']) {
    await como(e);
    const n = await uno(`select (select count(*) from comercial.costos_lote)::int a, (select count(*) from comercial.v_costo_referencia where costo_unitario_ars is not null)::int b`);
    if (n.a !== 0 || n.b !== 0) throw new Error(`${e}: ${JSON.stringify(n)}`);
  }
});

// Recepción nueva de 101ESE con dos lotes y un flete.
await como('naza@x');
const ins = (await uno(`select id from gmp.insumos_catalogo where codigo_interno='105BOL'`)).id;
const esencia = (await uno(`select id from gmp.insumos_catalogo where codigo_interno='101ESE'`)).id;
const prov = (await uno(`insert into gmp.proveedores (razon_social) values ('Prov Costos') returning id`)).id;
const rec = (await uno(`insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1,'RC1',true) returning id`, [prov])).id;
const lote = async (insumo, cant, unidad) =>
  (await uno(`insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados, protocolo_recibido) values ($1,$2,'L',1,$3,$4,true,true) returning id`, [rec, insumo, cant, unidad])).id;
const lBol = await lote(ins, 100, 'UNIDAD');
let lEse;

await prueba('factura A con IVA incluido: se guarda el neto', async () => {
  const c = await uno(`insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, incluye_iva, alicuota_iva, cantidad, unidad) values ($1,'FACTURA_A',12100,true,21,100,'UNIDAD') returning importe_neto_ars`, [lBol]);
  if (N(c.importe_neto_ars) !== 10000) throw new Error(JSON.stringify(c));
});
await prueba('sin comprobante: el importe entero es costo', async () => {
  lEse = await lote(esencia, 2, 'ml');
  const c = await uno(`insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad) values ($1,'SIN_COMPROBANTE',40000,2,'l') returning importe_neto_ars`, [lEse]);
  if (N(c.importe_neto_ars) !== 40000) throw new Error(JSON.stringify(c));
});
await rechaza('factura B no lleva alícuota', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, incluye_iva, alicuota_iva, cantidad, unidad) values ('${lBol}','FACTURA_B',1,true,21,1,'UNIDAD')`, /iva_solo_factura_a/);
await rechaza('un segundo costo original para el mismo lote', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad) values ('${lBol}','SIN_COMPROBANTE',1,1,'UNIDAD')`, /original_idx|duplicate|unique/);
await rechaza('pesos con tipo de cambio distinto de 1', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad, tipo_cambio) values ('${lBol}','SIN_COMPROBANTE',1,1,'UNIDAD',2)`, /tipo_cambio/);
await rechaza('Gerencia de Producción no carga apertura', `insert into comercial.costos_lote (lote_insumo_id, origen, importe, cantidad, unidad) values ('${lBol}','APERTURA',1,1,'UNIDAD')`, /row-level|policy|saldo de apertura/);
await rechaza('Gerencia de Producción no fija el costo de referencia', `insert into comercial.costos_referencia (insumo_id, importe, unidad) values ('${esencia}',1,'ml')`, /row-level|policy/);
await rechaza('un costo no se edita', `update comercial.costos_lote set importe = 1 where lote_insumo_id = '${lBol}'`, /permission|privilegi/);
await rechaza('un costo no se borra', `delete from comercial.costos_lote where lote_insumo_id = '${lBol}'`, /permission|privilegi/);

await prueba('flete prorrateado por valor entre los lotes de la recepción', async () => {
  await q(`insert into comercial.costos_accesorios (recepcion_id, concepto, tipo_comprobante, importe) values ($1,'FLETE','SIN_COMPROBANTE',5000)`, [rec]);
  // precios 10.000 y 40.000 → el flete se reparte 1.000 / 4.000.
  const b = await uno(`select * from comercial.v_costos_lote_unitario where lote_insumo_id=$1`, [lBol]);
  const e = await uno(`select * from comercial.v_costos_lote_unitario where lote_insumo_id=$1`, [lEse]);
  if (N(b.accesorios_ars) !== 1000 || N(e.accesorios_ars) !== 4000) throw new Error(JSON.stringify([b, e]));
  // 101ESE se mide en ml: (40.000 + 4.000) / 2.000 ml = $22 el ml.
  if (!cerca(b.costo_unitario_ars, 110) || !cerca(e.costo_unitario_ars, 22)) throw new Error(JSON.stringify([b, e]));
});
await prueba('el último lote gana sobre la apertura', async () => {
  const r = await uno(`select origen, costo_unitario_ars from comercial.v_costo_referencia where insumo_id=$1`, [esencia]);
  if (r.origen !== 'ULTIMO_LOTE' || !cerca(r.costo_unitario_ars, 22)) throw new Error(JSON.stringify(r));
});
await prueba('rectificar: la fila nueva manda, la vieja queda', async () => {
  const orig = (await uno(`select id from comercial.costos_lote where lote_insumo_id=$1`, [lEse])).id;
  await q(`insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad, rectifica_a, motivo) values ($1,'SIN_COMPROBANTE',36000,2,'l',$2,'Mal tipeado')`, [lEse, orig]);
  const n = await uno(`select count(*)::int n from comercial.costos_lote where lote_insumo_id=$1`, [lEse]);
  const e = await uno(`select precio_neto_ars from comercial.v_costos_lote where lote_insumo_id=$1`, [lEse]);
  if (n.n !== 2 || N(e.precio_neto_ars) !== 36000) throw new Error(JSON.stringify([n, e]));
});
await rechaza('rectificación sin motivo', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad, rectifica_a) values ('${lBol}','SIN_COMPROBANTE',1,1,'UNIDAD',(select id from comercial.costos_lote where lote_insumo_id='${lBol}'))`, /con_motivo/);

await prueba('conciliación: factura A de la recepción contra los netos de los lotes', async () => {
  await q(`insert into comercial.comprobantes_proveedor (proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ($1,$2,'FACTURA_A',1,555,46000,9660,55660)`, [prov, rec]);
  const c = await uno(`select * from comercial.v_conciliacion_recepcion where recepcion_id=$1`, [rec]);
  // lotes 10.000 + 36.000 = 46.000: concilia.
  if (N(c.diferencia) !== 0 || c.con_aviso) throw new Error(JSON.stringify(c));
});

// Finanzas: costo de referencia manual y aviso de variación real.
await como('gaby@x');
await prueba('el manual de Finanzas gana sobre el último lote', async () => {
  await q(`insert into comercial.costos_referencia (insumo_id, importe, cantidad, unidad, vigente_desde) values ($1, 15000, 1, 'l', '2026-08-01')`, [esencia]);
  const r = await uno(`select origen, costo_unitario_ars, costo_ultimo_lote from comercial.v_costo_referencia where insumo_id=$1`, [esencia]);
  // Último lote: (36.000 + 5.000 × 36.000 / 46.000) / 2.000 ml, con el flete re-prorrateado tras la rectificación.
  if (r.origen !== 'MANUAL' || !cerca(r.costo_unitario_ars, 15) || !cerca(r.costo_ultimo_lote, (36000 + 5000 * 36000 / 46000) / 2000, 1e-5)) throw new Error(JSON.stringify(r));
});
await prueba('aviso con variación real: IPC de agosto a octubre descuenta la inflación', async () => {
  await q(`insert into comercial.series_macro (serie, mes, valor, fuente) values ('IPC','2026-08-01',100,'INDEC'),('IPC','2026-10-01',110,'INDEC')`);
  await como('naza@x');
  const l2 = await lote(esencia, 1, 'ml');
  // $18.000 el litro contra $15.000: nominal +20 %; real = 1,2 / 1,1 − 1 = +9,09 % > 5 %.
  const c = await uno(`insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad, fecha_costo) values ($1,'SIN_COMPROBANTE',18000,1,'l','2026-10-05') returning id`, [l2]);
  await como('gaby@x');
  const a = await uno(`select * from comercial.avisos_costo where costo_lote_id=$1`, [c.id]);
  if (!a || !cerca(a.variacion_nominal, 0.2) || !cerca(a.ipc_acumulado, 0.1) || !cerca(a.variacion_real, 1.2 / 1.1 - 1, 1e-5)) throw new Error(JSON.stringify(a));
});
await prueba('sin aviso si la variación real queda dentro del umbral', async () => {
  await como('naza@x');
  const l3 = await lote(esencia, 1, 'ml');
  // $16.000 contra $15.000: nominal +6,7 %; real = 1,0667 / 1,1 − 1 = −3 %.
  const c = await uno(`insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad, fecha_costo) values ($1,'SIN_COMPROBANTE',16000,1,'l','2026-10-06') returning id`, [l3]);
  await como('gaby@x');
  const a = await uno(`select count(*)::int n from comercial.avisos_costo where costo_lote_id=$1`, [c.id]);
  if (a.n !== 0) throw new Error('avisó');
});
await prueba('Finanzas marca el aviso como visto; no puede tocar los números', async () => {
  const a = (await uno(`select id from comercial.avisos_costo limit 1`)).id;
  await q(`update comercial.avisos_costo set visto_por = core.usuario_actual(), visto_en = now() where id=$1`, [a]);
  const v = await uno(`select visto_por from comercial.avisos_costo where id=$1`, [a]);
  if (!v.visto_por) throw new Error('sin autor');
});
await rechaza('Finanzas no reescribe la variación del aviso', `update comercial.avisos_costo set variacion_real = 0`, /permission|privilegi/);
await rechaza('el precio de referencia no se edita', `update comercial.costos_referencia set importe = 1`, /permission|privilegi/);
await prueba('el precio de referencia se da de baja con fecha de fin', async () => {
  await q(`update comercial.costos_referencia set vigente_hasta = current_date - 1 where insumo_id=$1`, [esencia]);
  const r = await uno(`select origen from comercial.v_costo_referencia where insumo_id=$1`, [esencia]);
  if (r.origen !== 'ULTIMO_LOTE') throw new Error(r.origen);
});

await prueba('parámetros: sin carga rigen los valores por defecto; Finanzas carga el costo hora', async () => {
  let p = await uno(`select * from comercial.v_parametros_costo`);
  if (p.costo_hora !== null || N(p.umbral_variacion) !== 0.05 || N(p.margen_minimo) !== 0.25) throw new Error(JSON.stringify(p));
  await q(`insert into comercial.parametros_costo (costo_hora) values (6000)`);
  p = await uno(`select * from comercial.v_parametros_costo`);
  if (N(p.costo_hora) !== 6000 || N(p.umbral_variacion) !== 0.05) throw new Error(JSON.stringify(p));
});
await como('naza@x');
await rechaza('Gerencia de Producción no cambia el costo hora', `insert into comercial.parametros_costo (costo_hora) values (1)`, /row-level|policy/);

// Costo de un producto con fórmula (vigente o, si no hay, la última en borrador).
await prueba('costo de producto: granel escalado, acondicionamiento con merma y mano de obra', async () => {
  const f = await uno(`select f.producto_id, f.estado from gmp.formulas_fabricacion f join gmp.productos p on p.id=f.producto_id where f.estado <> 'DADO_DE_BAJA' and p.activo order by (f.estado='VIGENTE') desc limit 1`);
  if (!f) throw new Error('no hay fórmulas en la base de prueba');
  const pid = f.producto_id;
  let r = await q(`select * from comercial.costo_producto($1)`, [pid]);
  if (!r.some((x) => x.falta === 'Sin contenido neto por unidad')) throw new Error('debía faltar el contenido');
  await q(`update gmp.productos set contenido_neto = 14, unidad_contenido = 'g' where id=$1`, [pid]);
  await q(`insert into comercial.minutos_producto (producto_id, minutos_por_unidad) values ($1, 1.5)`, [pid]);
  r = await q(`select * from comercial.costo_producto($1)`, [pid]);
  const granel = r.filter((x) => x.tipo === 'GRANEL');
  const masa = granel.reduce((s, x) => s + N(x.cantidad), 0);
  const rend = N((await uno(`select f.rendimiento from comercial.formula_para_costo($1) fc join gmp.formulas_fabricacion f on f.id = fc.formula_id`, [pid])).rendimiento);
  if (Math.abs(masa - 14 / rend) > 0.01) throw new Error(`masa ${masa} vs ${14 / rend}`);
  for (const x of granel.filter((x) => x.subtotal != null))
    if (Math.abs(N(x.subtotal) - N(x.cantidad) * N(x.costo_unitario)) > 0.001) throw new Error(JSON.stringify(x));
  const mo = r.find((x) => x.tipo === 'MANO_DE_OBRA');
  if (N(mo.subtotal) !== 150) throw new Error(JSON.stringify(mo)); // 1,5 min × $6.000 / 60
  const v = await uno(`select * from comercial.v_costo_producto where producto_id=$1`, [pid]);
  const suma = r.reduce((s, x) => s + N(x.subtotal ?? 0), 0);
  if (Math.abs(N(v.costo_unitario) - suma) > 0.001) throw new Error(JSON.stringify(v));
});

// Correcciones de la revisión de revisor-sql.
await como('gaby@x');
await rechaza('el aviso no se marca visto dos veces', `update comercial.avisos_costo set visto_por = core.usuario_actual(), visto_en = now() where visto_en is not null`, /ya figura como visto/);
await rechaza('precio de referencia en una unidad que no se puede convertir', `insert into comercial.costos_referencia (insumo_id, importe, unidad) values ('${ins}', 100, 'kg')`, /No se puede pasar/);
await prueba('una fila que sólo cambia el umbral no borra el costo hora', async () => {
  await q(`insert into comercial.parametros_costo (umbral_variacion) values (0.1)`);
  const p = await uno(`select * from comercial.v_parametros_costo`);
  if (N(p.costo_hora) !== 6000 || N(p.umbral_variacion) !== 0.1) throw new Error(JSON.stringify(p));
});
await prueba('Finanzas carga el costo de un lote de apertura que la planilla no tenía', async () => {
  const l = await uno(`select l.id from gmp.lotes_insumo l where l.migracion_apertura_id is not null and not exists (select 1 from comercial.costos_lote c where c.lote_insumo_id = l.id) limit 1`);
  await q(`insert into comercial.costos_lote (lote_insumo_id, origen, importe, cantidad, unidad) values ($1,'APERTURA',100,1,'UNIDAD')`, [l.id]);
});
await como('naza@x');
await rechaza('un costo de recepción no va sobre un lote de apertura', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, cantidad, unidad) values ((select l.id from gmp.lotes_insumo l where l.migracion_apertura_id is not null and not exists (select 1 from comercial.costos_lote c where c.lote_insumo_id = l.id) limit 1),'SIN_COMPROBANTE',1,1,'UNIDAD')`, /no vino de una recepción/);
await prueba('conciliación: la nota de crédito del proveedor se descuenta', async () => {
  await como('naza@x');
  const fa = (await uno(`select id from comercial.comprobantes_proveedor where recepcion_id=$1 and tipo='FACTURA_A'`, [rec])).id;
  await q(`insert into comercial.comprobantes_proveedor (proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total, comprobante_asociado_id) values ($1,$2,'NOTA_CREDITO_A',1,556,1000,210,1210,$3)`, [prov, rec, fa]);
  const c = await uno(`select * from comercial.v_conciliacion_recepcion where recepcion_id=$1`, [rec]);
  // 46.000 de factura − 1.000 de nota de crédito; la diferencia es contra los lotes de la recepción.
  if (N(c.neto_comprobantes) !== 45000 || N(c.diferencia) !== N(c.neto_lotes) - 45000 || !c.con_aviso) throw new Error(JSON.stringify(c));
});
await prueba('un operario no ve parámetros ni costo de productos', async () => {
  await como('oper@x');
  const p = await q(`select * from comercial.v_parametros_costo`);
  const v = await uno(`select count(*) filter (where costo_unitario is not null)::int n from comercial.v_costo_producto`);
  if (p.length !== 0 || v.n !== 0) throw new Error(JSON.stringify({ p, v }));
});
await prueba('v_costo_producto recorre todos los productos activos', async () => {
  await como('gaby@x');
  const v = await uno(`select count(*)::int n from comercial.v_costo_producto`);
  const a = await uno(`select count(*)::int n from gmp.productos where activo`);
  if (v.n !== a.n) throw new Error(JSON.stringify({ v, a }));
});

// Segunda revisión (20261009120310 y 120410).
await prueba('apertura rectificada: 111ENV en pesos y 135FRA6 sin fecha, mismo neto', async () => {
  await como('gaby@x');
  const e = await uno(`select moneda, fecha_costo, precio_neto_ars from comercial.v_costos_lote where codigo_interno='111ENV' and origen='APERTURA'`);
  const f = await uno(`select moneda, fecha_costo from comercial.v_costos_lote where codigo_interno='135FRA6' and origen='APERTURA'`);
  if (!e || e.moneda !== 'ARS' || Math.abs(N(e.precio_neto_ars) - 183.9185) > 0.01) throw new Error(JSON.stringify(e));
  if (!f || f.fecha_costo !== null) throw new Error(JSON.stringify(f));
});
await como('naza@x');
await rechaza('factura B con «incluye IVA» y sin alícuota', `insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, incluye_iva, cantidad, unidad) values ((select lote_insumo_id from comercial.costos_lote where tipo_comprobante='SIN_COMPROBANTE' limit 1),'FACTURA_B',1,true,1,'UNIDAD')`, /iva_solo_factura_a|original_idx|duplicate/);
await prueba('merma de acondicionamiento: cantidad / (1 − merma)', async () => {
  await como('gaby@x');
  const m = await uno(`select m.producto_id, m.insumo_id, m.cantidad_por_unidad, m.merma from gmp.materiales_acondicionamiento m
                        join comercial.v_costo_referencia c on c.insumo_id = m.insumo_id and c.costo_unitario_ars is not null
                       where m.activo and m.merma > 0 limit 1`);
  if (!m) return; // sin datos con merma en esta base: nada que comparar
  const r = await uno(`select subtotal, costo_unitario from comercial.costo_producto($1) where insumo_id=$2 and tipo='ACONDICIONAMIENTO'`, [m.producto_id, m.insumo_id]);
  const esperado = N(m.cantidad_por_unidad) / (1 - N(m.merma)) * N(r.costo_unitario);
  if (Math.abs(N(r.subtotal) - esperado) > 0.001) throw new Error(JSON.stringify({ m, r, esperado }));
});
await prueba('una fórmula sin componentes figura como faltante', async () => {
  await db.exec('reset role');
  const p = (await uno(`insert into gmp.productos (codigo_interno, nombre, contenido_neto, unidad_contenido) values ('ZZVACIO','Vacío',10,'g') returning id`)).id;
  await q(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00')`, [p]);
  await como('gaby@x');
  const r = await q(`select falta from comercial.costo_producto($1) where tipo='GRANEL'`, [p]);
  if (r.length !== 1 || r[0].falta !== 'Fórmula sin componentes') throw new Error(JSON.stringify(r));
});

await invariantes();
fin();
