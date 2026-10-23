// Nuevo producto para Gerencia de Producción, con DT aprobando
// (20261023120000, D-nuevo-producto-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

// Un producto con fórmula, procedimiento y especificación, cargados por DT.
await como(DT);
const origen = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const fOrigen = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version, densidad_producto) values ($1, '1', 0.9) returning id`,
    [origen],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp) values ($1, 1, 'Agua', 60), ($1, 2, 'Alcohol', 40)`,
  [fOrigen],
);
await q(
  `insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp, anulado) values ($1, 3, 'Quitado', 1, true)`,
  [fOrigen],
);
await q(
  `insert into gmp.formula_procedimientos (formula_id, texto) values ($1, 'Mezclar agua y alcohol')`,
  [fOrigen],
);
const eOrigen = (
  await uno(
    `insert into gmp.especificaciones (codigo_poe, version, producto_id, denominacion, vida_util_meses) values ('I-E.50.01','00',$1,'ORIGEN',24) returning id`,
    [origen],
  )
).id;
await q(
  `insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, unidad) values ($1,1,'Densidad','FISICOQUIMICO','RANGO',0.89,0.91,'g/ml')`,
  [eOrigen],
);

await prueba('lo que escribe DT rige sin aprobar', async () => {
  const v = await uno(
    `select version from gmp.v_procedimiento_vigente where formula_id = $1`,
    [fOrigen],
  );
  if (v?.version !== 1) throw new Error(JSON.stringify(v));
});

// Naza da de alta un producto nuevo y copia de otro.
await como('naza@x');
const nuevo = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('NP-1', 'Nuevo', 36) returning id`,
  )
).id;
let fNueva;
await prueba('Naza copia la fórmula: borrador nuevo, sin lo anulado', async () => {
  fNueva = (await uno(`select gmp.copiar_formula($1, $2) id`, [fOrigen, nuevo])).id;
  const f = await uno(
    `select estado, version, densidad_producto::float d from gmp.formulas_fabricacion where id = $1`,
    [fNueva],
  );
  if (f.estado !== 'BORRADOR' || f.version !== '1' || f.d !== 0.9)
    throw new Error(JSON.stringify(f));
  const n = await uno(
    `select count(*)::int n from gmp.formula_componentes where formula_id = $1`,
    [fNueva],
  );
  if (n.n !== 2) throw new Error(String(n.n));
});
await prueba('y la puede editar', async () => {
  await q(
    `update gmp.formula_componentes set observacion = 'Ajustada por Naza' where formula_id = $1 and orden = 1`,
    [fNueva],
  );
});
await prueba('su procedimiento queda a aprobar y no rige', async () => {
  await q(
    `insert into gmp.formula_procedimientos (formula_id, texto) values ($1, 'Copiado y ajustado')`,
    [fNueva],
  );
  const v = await q(`select 1 from gmp.v_procedimiento_vigente where formula_id = $1`, [
    fNueva,
  ]);
  if (v.length !== 0) throw new Error('rige sin aprobar');
  const p = await q(
    `select 1 from gmp.v_pendientes_dt where producto_id = $1 and seccion = 'PROCEDIMIENTO' and motivo = 'A_APROBAR'`,
    [nuevo],
  );
  if (p.length !== 1) throw new Error('no está en pendientes');
});
await rechaza(
  'Naza no aprueba',
  `insert into gmp.procedimiento_aprobaciones (procedimiento_id) select id from gmp.formula_procedimientos where formula_id = '${fNueva}'`,
  /row-level security|violates/,
);
await prueba('copia la especificación como borrador 00 con otro código', async () => {
  const id = (
    await uno(`select gmp.copiar_especificacion($1, $2, 'I-E.50.99') id`, [
      eOrigen,
      nuevo,
    ])
  ).id;
  const e = await uno(
    `select estado, version, denominacion, (select count(*)::int from gmp.espec_parametros where especificacion_id = $1) n from gmp.especificaciones where id = $1`,
    [id],
  );
  if (
    e.estado !== 'BORRADOR' ||
    e.version !== '00' ||
    e.denominacion !== 'Nuevo' ||
    e.n !== 1
  )
    throw new Error(JSON.stringify(e));
});
const otro = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('NP-2', 'Otro', 12) returning id`,
  )
).id;
await prueba('«No la sé» del procedimiento y la especificación llega a DT', async () => {
  await q(
    `insert into gmp.consultas_dt (producto_id, seccion) values ($1, 'PROCEDIMIENTO'), ($1, 'ESPECIFICACION')`,
    [otro],
  );
  const p = await q(
    `select seccion, pedido_por from gmp.v_pendientes_dt where producto_id = $1 and motivo = 'NO_LA_SABE'`,
    [otro],
  );
  if (p.length !== 2 || p.some((x) => x.pedido_por !== 'naza@x'))
    throw new Error(JSON.stringify(p));
});
await rechaza(
  'no se pide dos veces',
  `insert into gmp.consultas_dt (producto_id, seccion) values ('${otro}', 'PROCEDIMIENTO')`,
  /duplicate|unique/,
);
await como('ventas@x');
await rechaza(
  'Ventas no deriva',
  `insert into gmp.consultas_dt (producto_id, seccion) values ('${origen}', 'ESPECIFICACION')`,
  /row-level security|violates/,
);
await rechaza(
  'ni copia',
  `select gmp.copiar_formula('${fOrigen}', '${origen}')`,
  /Gerencia de Producción o Dirección/,
);

await como(DT);
await prueba('DT aprueba: rige, y sale de pendientes', async () => {
  await q(
    `insert into gmp.procedimiento_aprobaciones (procedimiento_id) select id from gmp.formula_procedimientos where formula_id = $1`,
    [fNueva],
  );
  const v = await uno(
    `select texto, aprobado_por is not null a from gmp.v_procedimiento_vigente where formula_id = $1`,
    [fNueva],
  );
  if (v.texto !== 'Copiado y ajustado' || !v.a) throw new Error(JSON.stringify(v));
  const p = await q(
    `select 1 from gmp.v_pendientes_dt where producto_id = $1 and seccion = 'PROCEDIMIENTO'`,
    [nuevo],
  );
  if (p.length !== 0) throw new Error('sigue pendiente');
});
await rechaza(
  'lo de DT no se aprueba',
  `insert into gmp.procedimiento_aprobaciones (procedimiento_id) select id from gmp.formula_procedimientos where formula_id = '${fOrigen}'`,
  /no espera aprobación/,
);
await prueba('una orden toma la versión que rige, no la que espera', async () => {
  await como('naza@x');
  await q(
    `insert into gmp.formula_procedimientos (formula_id, texto, motivo_cambio) values ($1, 'Versión 2 sin aprobar', 'Prueba')`,
    [fNueva],
  );
  await como(DT);
  await q(`update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = $1`, [
    fNueva,
  ]);
  const o = await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, presentacion, cantidad_teorica)
     values ($1, $2, current_date, 1, 1, 10) returning procedimiento_version v`,
    [fNueva, nuevo],
  ).catch((e) => ({ error: e.message }));
  if (o.error) throw new Error(o.error);
  if (o.v !== 1) throw new Error(JSON.stringify(o));
});

await invariantes();
fin();
