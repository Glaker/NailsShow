// La encargada de stock asigna y modifica tareas, también las de Naza
// (20261026150000, D-tareas-agustina-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('agustina@x', 'VENTAS');
await usuario('delia@x', 'PRODUCCION');
await usuario('ventas@x', 'VENTAS');
await db.exec('reset role');
// Como en la real: VENTAS con ENCARGADA_STOCK de rol adicional (20261022150300).
await q(
  `update core.usuarios set roles_adicionales = '{ENCARGADA_STOCK}' where email = 'agustina@x'`,
);
const id = async (email) =>
  (await uno(`select id from core.usuarios where email = $1`, [email])).id;
const [naza, agustina, delia] = [
  await id('naza@x'),
  await id('agustina@x'),
  await id('delia@x'),
];
// public.sesion arma el JWT solo con el rol principal; el real trae también los
// adicionales (custom access token hook).
const comoAgustina = async () => {
  await db.exec('reset role');
  await q(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({
      rol: 'VENTAS',
      roles: ['VENTAS', 'ENCARGADA_STOCK'],
      usuario_id: agustina,
      role: 'authenticated',
    }),
  ]);
  await db.exec('set role authenticated');
};

await como('naza@x');
const deNaza = (
  await uno(
    `insert into gmp.tareas_produccion (tipo, descripcion, asignadas) values ('ETIQUETAR', 'Etiquetar 200', $1) returning id`,
    [[delia]],
  )
).id;

await comoAgustina();
await prueba('Agustina ve la tarea que cargó Naza', async () => {
  const t = await uno(`select count(*)::int n from gmp.tareas_produccion where id = $1`, [
    deNaza,
  ]);
  if (t.n !== 1) throw new Error('no la ve');
});
await prueba('y la modifica: texto, prioridad y a quién va', async () => {
  await q(
    `update gmp.tareas_produccion set descripcion = 'Etiquetar 300', prioridad = -1, asignadas = $2 where id = $1`,
    [deNaza, [delia, naza]],
  );
  const t = await uno(
    `select descripcion, asignadas from gmp.tareas_produccion where id = $1`,
    [deNaza],
  );
  if (t.descripcion !== 'Etiquetar 300' || t.asignadas.length !== 2)
    throw new Error(JSON.stringify(t));
});
let deAgustina;
await prueba('arma el día y asigna una tarea, también a sí misma', async () => {
  await q(
    `insert into gmp.jornadas_operarias (fecha, usuario_id) values (current_date, $1)`,
    [delia],
  );
  deAgustina = (
    await uno(
      `insert into gmp.tareas_produccion (tipo, descripcion, asignadas) values ('OTRA', 'Ordenar depósito', $1) returning id`,
      [[agustina, delia]],
    )
  ).id;
});
await prueba('la cancela mientras está pendiente', async () => {
  await q(`update gmp.tareas_produccion set estado = 'CANCELADA' where id = $1`, [
    deAgustina,
  ]);
});

await como('naza@x');
await prueba(
  'Naza ve y edita la de Agustina… si sigue viva: la cancelada ya no',
  async () => {
    const t = await uno(`select estado from gmp.tareas_produccion where id = $1`, [
      deAgustina,
    ]);
    if (t.estado !== 'CANCELADA') throw new Error(t.estado);
  },
);
await rechaza(
  'una cancelada no se modifica',
  `update gmp.tareas_produccion set descripcion = 'x' where id = '${deAgustina}'`,
  /ya no se modifica/,
);
await prueba('Naza también puede trabajar una tarea asignada a ella', async () => {
  await q(`select gmp.iniciar_tarea($1)`, [deNaza]);
});

await como('ventas@x');
await rechaza(
  'Ventas sin el rol de stock sigue sin asignar',
  `insert into gmp.tareas_produccion (tipo, descripcion) values ('OTRA', 'x')`,
  /row-level security/,
);
await invariantes();
fin();
