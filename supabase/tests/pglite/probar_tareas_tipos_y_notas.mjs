// Tipos Reprocesar y Limpiar; dónde buscar, dónde dejar y notas (20261027120000, D-tareas-3).
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('delia@x', 'PRODUCCION');
await como('delia@x');
const delia = (await uno(`select core.usuario_actual() id`)).id;
await como('naza@x');
let t;
await prueba(
  'Naza manda «Reprocesar» con dónde buscar, dónde dejar y notas',
  async () => {
    t = (
      await uno(
        `insert into gmp.tareas_produccion (tipo, descripcion, cantidad, asignadas, donde_buscar, donde_dejar, notas)
       values ('REPROCESAR', 'Reprocesar Sanitizante', 50, $1, 'Alcohol: Materia prima — aprobada · B-12', 'Producto terminado — fábrica', 'Usar guantes')
       returning id`,
        [[delia]],
      )
    ).id;
  },
);
await prueba('«Limpiar» también es un tipo', async () => {
  await q(
    `insert into gmp.tareas_produccion (tipo, descripcion) values ('LIMPIAR', 'Limpiar la envasadora')`,
  );
});
await rechaza(
  'un tipo inventado no',
  `insert into gmp.tareas_produccion (tipo, descripcion) values ('BAILAR', 'x')`,
  /tareas_produccion_tipo_check/,
);
await como('delia@x');
await prueba('Delia lee dónde buscar, dónde dejar y las notas', async () => {
  const r = await uno(
    `select donde_buscar, donde_dejar, notas from gmp.tareas_produccion where id = $1`,
    [t],
  );
  if (r.notas !== 'Usar guantes' || !r.donde_buscar.includes('B-12'))
    throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
