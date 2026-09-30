import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('cc@x', 'CONTROL_CALIDAD');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const f = await uno(`insert into gmp.formulas_fabricacion (producto_id, version, codigo_me) values ($1, '00', 'ME.40.26') returning id, producto_id`, [prod]);

// ------------------------------ Especificaciones ------------------------------
await como('naza@x');
let esp;
await prueba('Producción redacta una especificación en borrador', async () => {
  esp = (await uno(`insert into gmp.especificaciones (codigo_poe, version, denominacion, vida_util_meses) values ('I-E.50.25','00','LIQUIDO ACRILICO',24) returning id`)).id;
  await q(`insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max) values ($1,1,'Ethyl Methacrylate',90,95)`, [esp]);
  await q(`insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, unidad) values ($1,1,'Densidad','FISICOQUIMICO','RANGO',0.91,0.92,'g/ml')`, [esp]);
  await q(`insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, unidad) values ($1,2,'Volátiles','FISICOQUIMICO','MINIMO',95,'%')`, [esp]);
  await q(`insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_texto) values ($1,3,'Aspecto','ORGANOLEPTICO','VALOR_TEXTO','Líquido translúcido')`, [esp]);
});
await rechaza('un RANGO sin límites', `insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio) values ('${esp}',9,'x','FISICOQUIMICO','RANGO')`, /criterio/);
await rechaza('Producción no aprueba', `select gmp.aprobar_especificacion('${esp}')`, /Dirección Técnica/);
await como(DT);
await prueba('la DT aprueba: vigente, con fecha y autor', async () => {
  await q(`select gmp.aprobar_especificacion($1)`, [esp]);
  const e = await uno(`select estado, aprobada_por, vigencia_desde from gmp.especificaciones where id=$1`, [esp]);
  if (e.estado !== 'VIGENTE' || !e.aprobada_por || !e.vigencia_desde) throw new Error(JSON.stringify(e));
});
await rechaza('una vigente no se edita', `update gmp.especificaciones set denominacion='X' where id='${esp}'`, /no se edita/);
await rechaza('ni sus requisitos', `update gmp.espec_parametros set valor_max=1 where especificacion_id='${esp}'`, /borrador/);
let esp2;
await prueba('nueva versión: copia en borrador y al aprobarla da de baja la anterior', async () => {
  await como('naza@x');
  esp2 = (await uno(`select gmp.nueva_version_especificacion($1, 'ajuste de densidad') id`, [esp])).id;
  const n = await uno(`select version, (select count(*)::int from gmp.espec_parametros where especificacion_id=$1) p from gmp.especificaciones where id=$1`, [esp2]);
  if (n.version !== '01' || n.p !== 3) throw new Error(JSON.stringify(n));
  await como(DT);
  await q(`select gmp.aprobar_especificacion($1)`, [esp2]);
  const v = await uno(`select estado from gmp.especificaciones where id=$1`, [esp]);
  if (v.estado !== 'DADO_DE_BAJA') throw new Error(v.estado);
});
await prueba('motor de evaluación: numéricos solos, cualitativos sin dictamen', async () => {
  const p = await q(`select id, nombre from gmp.espec_parametros where especificacion_id=$1 order by orden`, [esp2]);
  const r = await uno(`select gmp.cumple_parametro($1, 0.915) a, gmp.cumple_parametro($1, 0.93) b, gmp.cumple_parametro($2, 96) c, gmp.cumple_parametro($3, 1) d`, [p[0].id, p[1].id, p[2].id]);
  if (r.a !== true || r.b !== false || r.c !== true || r.d !== null) throw new Error(JSON.stringify(r));
});

// ------------------------------ Órdenes ------------------------------
await como('naza@x');
let op;
await prueba('abrir orden: número, lote y vencimiento según I.40.25', async () => {
  op = await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, especificacion_id, jornada, partida, presentacion, cantidad_teorica) values ($1,$2,$3,'2025-07-11',1,2,200) returning *`, [f.id, f.producto_id, esp2]);
  if (!/^OP-2025-0001$/.test(op.numero) || op.numero_lote !== '#2 11/07/25' || op.vencimiento_texto !== 'P1 07/27') throw new Error(JSON.stringify(op));
});
await prueba('la segunda orden del año sigue la numeración', async () => {
  const o = await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, presentacion, cantidad_teorica, vencimiento) values ($1,$2,'2025-07-11',2,1,50,'2028-07-01') returning numero, vencimiento_texto`, [f.id, f.producto_id]);
  if (o.numero !== 'OP-2025-0002' || o.vencimiento_texto !== 'P2 07/28') throw new Error(JSON.stringify(o));
});
await rechaza('el lote no se cambia', `update gmp.ordenes_produccion set numero_lote='X' where id='${op.id}'`, /no cambian/);
await como('op@x');
await prueba('el operario registra la pesada (realizó) y la corrige antes del control', async () => {
  await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'PESADA',$2)`, [op.id, JSON.stringify({ verificaciones: { area_limpia: true } })]);
  await q(`update gmp.op_etapas set datos=$2 where orden_id=$1 and etapa='PESADA'`, [op.id, JSON.stringify({ verificaciones: { area_limpia: true }, filas: [] })]);
});
await rechaza('el operario no registra control de calidad', `insert into gmp.op_etapas (orden_id, etapa) values ('${op.id}','CC_PT')`, /Control de Calidad/);
await como('naza@x');
await prueba('Producción controla la pesada: queda cerrada', async () => {
  await q(`update gmp.op_etapas set controlo_por=core.usuario_actual(), controlo_en=now() where orden_id=$1 and etapa='PESADA'`, [op.id]);
  const e = await uno(`select controlo_por, realizo_por from gmp.op_etapas where orden_id=$1 and etapa='PESADA'`, [op.id]);
  if (!e.controlo_por || e.controlo_por === e.realizo_por) throw new Error(JSON.stringify(e));
});
await rechaza('una etapa controlada no se modifica', `update gmp.op_etapas set datos='{}' where orden_id='${op.id}' and etapa='PESADA'`, /controlada/);
await rechaza('no se termina sin fraccionamiento', `select gmp.terminar_orden('${op.id}', 199, 1000)`, /fraccionamiento/);
const registrar = async (etapa, quien, datos = {}) => {
  await como(quien);
  await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,$2,$3)`, [op.id, etapa, JSON.stringify(datos)]);
  await como(quien === 'naza@x' ? 'op@x' : 'naza@x');
  if (etapa === 'CC_GRANEL' || etapa === 'CC_PT' || etapa === 'REVISION') await como(DT);
  await q(`update gmp.op_etapas set controlo_por=core.usuario_actual(), controlo_en=now() where orden_id=$1 and etapa=$2`, [op.id, etapa]);
};
await prueba('el resto de las etapas y terminar', async () => {
  await registrar('ELABORACION', 'op@x');
  await registrar('MUESTREO_GRANEL', 'op@x');
  await registrar('CC_GRANEL', 'cc@x', { aprobado: true });
  await registrar('FRACCIONAMIENTO', 'op@x', { recuento: { canastas: 10, por_canasta: 100 } });
  await registrar('MUESTREO_PT', 'op@x');
  await registrar('CC_PT', 'cc@x', { aprobado: true });
  await registrar('CONTRAMUESTRA', 'op@x');
  await como('naza@x');
  await q(`select gmp.terminar_orden($1, 198.5, 1000)`, [op.id]);
});
await como(DT);
await rechaza('no se libera sin la revisión', `select gmp.liberar_orden('${op.id}', true)`, /revision sin registrar/);
await prueba('revisión y liberación por la DT', async () => {
  await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'REVISION','{}')`, [op.id]);
  await como('cc@x');
  await q(`update gmp.op_etapas set controlo_por=core.usuario_actual(), controlo_en=now() where orden_id=$1 and etapa='REVISION'`, [op.id]);
  await como(DT);
  await q(`select gmp.liberar_orden($1, true)`, [op.id]);
  const o = await uno(`select estado, liberada_por from gmp.ordenes_produccion where id=$1`, [op.id]);
  if (o.estado !== 'LIBERADA' || !o.liberada_por) throw new Error(JSON.stringify(o));
});
await rechaza('una orden liberada no se toca', `update gmp.ordenes_produccion set observaciones='x' where id='${op.id}'`, /no se modifica/);
await como('naza@x');
await rechaza('Producción no libera', `select gmp.liberar_orden((select id from gmp.ordenes_produccion where numero='OP-2025-0002'), true)`, /Dirección Técnica/);
await prueba('vínculo con el pedido (en comercial)', async () => {
  const o2 = (await uno(`select id from gmp.ordenes_produccion where numero='OP-2025-0002'`)).id;
  const p = (await uno(`insert into comercial.pedidos (numero, cliente) values ('P-1','Ana') returning id`)).id;
  await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [p, o2]);
});
await como('mati@x');
await rechaza('Ventas no abre órdenes', `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, cantidad_teorica) values ('${f.id}','${f.producto_id}','2025-08-01',10)`, /row-level/);
await invariantes();
fin();
