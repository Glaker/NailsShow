// Operarios de ejemplo: trabajan tareas de prueba sin contar en los informes,
// y Naza los da de baja (20261026170000, D-operarios-ejemplo-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('delia@x', 'PRODUCCION');
await usuario('ventas@x', 'VENTAS');
await usuario('operario1@ejemplo.nailshow.com.ar', 'OPERARIO');
await db.exec('reset role');
// Lo que hace la migración con las cuentas reales; acá se crearon después.
await q(
  `update core.usuarios set rol = 'PRODUCCION', es_ejemplo = true where email = 'operario1@ejemplo.nailshow.com.ar'`,
);
const id = async (email) =>
  (await uno(`select id from core.usuarios where email = $1`, [email])).id;
const [ej, delia] = [await id('operario1@ejemplo.nailshow.com.ar'), await id('delia@x')];

await como('naza@x');
const tarea = async (descripcion, asignadas) =>
  (
    await uno(
      `insert into gmp.tareas_produccion (tipo, descripcion, cantidad, asignadas) values ('OTRA', $1, 10, $2) returning id`,
      [descripcion, asignadas],
    )
  ).id;
const deEjemplo = await tarea('Tarea de prueba', [ej]);
const deVerdad = await tarea('Etiquetar 10', [delia]);

await prueba('la nómina marca al de ejemplo', async () => {
  const n = await uno(`select es_ejemplo from core.v_nomina where id = $1`, [ej]);
  if (n.es_ejemplo !== true) throw new Error(JSON.stringify(n));
});
for (const [quien, t] of [
  ['operario1@ejemplo.nailshow.com.ar', deEjemplo],
  ['delia@x', deVerdad],
]) {
  await como(quien);
  await q(`select gmp.iniciar_tarea($1)`, [t]);
  const tramo = (await uno(`select id from gmp.tarea_tramos where tarea_id = $1`, [t]))
    .id;
  await q(`select gmp.cerrar_tramo($1, 'COMPLETA', 10)`, [tramo]);
}
await como('naza@x');
await prueba(
  'el informe cuenta lo de Delia y no lo del operario de ejemplo',
  async () => {
    const r = await q(`select operaria, cantidad from gmp.v_trabajo_operarias`);
    const nombres = r.map((x) => x.operaria);
    if (
      !nombres.includes('delia@x') ||
      nombres.includes('operario1@ejemplo.nailshow.com.ar')
    )
      throw new Error(JSON.stringify(r));
  },
);

await rechaza(
  'una operaria de verdad no se da de baja por acá',
  `select core.dar_de_baja_ejemplo('${delia}')`,
  /operario de ejemplo activo/,
);
await como('ventas@x');
await rechaza(
  'Ventas no da de baja',
  `select core.dar_de_baja_ejemplo('${ej}')`,
  /Gerencia de Producción o DT/,
);
await como('naza@x');
await prueba('Naza da de baja al de ejemplo: queda inactivo, no se borra', async () => {
  await q(`select core.dar_de_baja_ejemplo($1)`, [ej]);
  const n = await uno(`select activo from core.v_nomina where id = $1`, [ej]);
  if (n.activo !== false) throw new Error('sigue activo');
});
await rechaza(
  'dos veces no',
  `select core.dar_de_baja_ejemplo('${ej}')`,
  /operario de ejemplo activo/,
);
await invariantes();
fin();
