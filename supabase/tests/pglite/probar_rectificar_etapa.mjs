// Rectificar una etapa controlada (20261120121700, D-rectificar-etapa-1). Caso
// OP-2026-0028: el control de PT quedó «no aplica» y la DT no podía liberar.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('cc@x', 'CONTROL_CALIDAD');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [duo],
  )
).id;

await como('naza@x');
const o = (
  await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica)
     values ($1,$2,current_date,1,1) returning id`,
    [f, duo],
  )
).id;
await como('op@x');
await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`, [o]);

await como(DT);
await q(`select gmp.dictaminar_granel($1, '50 g', 'Aspecto conforme', 'Cumple', true)`, [o]);
const faltan = await q(
  `select etapa from gmp.faltantes_liberacion($1) where falta = 'sin registrar'`,
  [o],
);
for (const { etapa } of faltan)
  await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1, $2, $3)`, [
    o,
    etapa,
    etapa === 'CC_PT' ? '{"no_aplica": true, "motivo": "granel"}' : '{"no_aplica": true}',
  ]);
await q(
  `update gmp.op_etapas set controlo_por = core.usuario_actual() where orden_id = $1 and controlo_por is null`,
  [o],
);
const ccpt = (await uno(`select id from gmp.op_etapas where orden_id=$1 and etapa='CC_PT'`, [o])).id;
const granel = (await uno(`select id from gmp.op_etapas where orden_id=$1 and etapa='CC_GRANEL'`, [o])).id;

await rechaza(
  'con el control de PT en «no aplica» no se libera',
  `select gmp.liberar_orden('${o}', true)`,
  /producto terminado no está aprobado/,
);
await rechaza(
  'la etapa controlada no se edita',
  `update gmp.op_etapas set datos = '{"aprobado": true}' where id = '${ccpt}'`,
  /ya está controlada/,
);
await rechaza(
  'sin motivo no se rectifica',
  `select gmp.rectificar_etapa('${ccpt}', '{"aprobado": true}', null, '  ')`,
  /motivo/,
);
await rechaza(
  'el granel no se rectifica por acá',
  `select gmp.rectificar_etapa('${granel}', '{"aprobado": true}', null, 'x')`,
  /R\.50\.10\.1/,
);
await como('op@x');
await rechaza(
  'un operario no rectifica',
  `select gmp.rectificar_etapa('${ccpt}', '{"aprobado": true}', null, 'x')`,
  /Control de Calidad o Dirección Técnica/,
);
await como('cc@x');
await prueba('Calidad rectifica el control de PT: queda el original y el anterior', async () => {
  await q(`select gmp.rectificar_etapa($1, $2::jsonb, $3, $4)`, [
    ccpt,
    '{"aprobado": true}',
    'Analizado contra especificación',
    'Se marcó «no aplica» por error',
  ]);
  const e = await uno(`select datos from gmp.op_etapas where id=$1`, [ccpt]);
  if (!e.datos.no_aplica) throw new Error('se tocó el original');
  const r = await uno(
    `select datos_anteriores, datos, motivo from gmp.op_etapas_rectificaciones where etapa_id=$1`,
    [ccpt],
  );
  if (!r.datos_anteriores.no_aplica || r.datos.aprobado !== true) throw new Error(JSON.stringify(r));
});
await rechaza(
  'la rectificación no se modifica',
  `update gmp.op_etapas_rectificaciones set motivo = 'otro' where etapa_id = '${ccpt}'`,
  /no se modifica|permission|policy|0 rows/,
);
await como(DT);
await prueba('y ahora la DT libera el lote', async () => {
  await q(`select gmp.liberar_orden($1, true)`, [o]);
  const r = await uno(`select estado from gmp.ordenes_produccion where id = $1`, [o]);
  if (r.estado !== 'LIBERADA') throw new Error(r.estado);
});
await rechaza(
  'liberada, ya no se rectifica',
  `select gmp.rectificar_etapa('${ccpt}', '{"aprobado": false}', null, 'x')`,
  /liberada/,
);
await invariantes();
fin();
