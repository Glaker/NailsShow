// La DT revisa una orden terminada y la libera (20261022170000, D-liberacion-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
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
await como('naza@x');
await q(`select comercial.terminar_orden($1, 5, 10)`, [o]);

await como(DT);
await prueba('terminada, a la DT le falta todo lo que no se controló', async () => {
  const f = await q(`select * from gmp.faltantes_liberacion($1)`, [o]);
  if (!f.some((x) => x.etapa === 'FRACCIONAMIENTO' && x.falta === 'sin controlar'))
    throw new Error(JSON.stringify(f));
});
await prueba('controla lo que hizo Producción', async () => {
  const r = await q(
    `update gmp.op_etapas set controlo_por = core.usuario_actual()
      where orden_id = $1 and etapa = 'FRACCIONAMIENTO' returning id`,
    [o],
  );
  if (r.length !== 1) throw new Error('no controló');
});
await prueba('analiza el granel con la orden ya terminada', async () => {
  await q(`select gmp.dictaminar_granel($1, '50 g', 'Aspecto conforme', 'Cumple', true)`, [o]);
});
await prueba('completa lo que no se registró y lo controla', async () => {
  const faltan = await q(`select etapa from gmp.faltantes_liberacion($1) where falta = 'sin registrar'`, [o]);
  for (const { etapa } of faltan)
    await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1, $2, $3)`, [o, etapa, etapa === 'CC_PT' ? '{"aprobado": true}' : '{"no_aplica": true}']);
  await q(
    `update gmp.op_etapas set controlo_por = core.usuario_actual() where orden_id = $1 and controlo_por is null`,
    [o],
  );
  const resto = await q(`select * from gmp.faltantes_liberacion($1)`, [o]);
  if (resto.length) throw new Error(JSON.stringify(resto));
});
await prueba('y la libera', async () => {
  await q(`select gmp.liberar_orden($1, true)`, [o]);
  const r = await uno(`select estado from gmp.ordenes_produccion where id = $1`, [o]);
  if (r.estado !== 'LIBERADA') throw new Error(r.estado);
});
await rechaza(
  'liberada, ya no se toca ninguna etapa',
  `update gmp.op_etapas set observaciones = 'x' where orden_id = '${o}' and etapa = 'REVISION'`,
  /liberada|ya está controlada/,
);
await invariantes();
fin();
