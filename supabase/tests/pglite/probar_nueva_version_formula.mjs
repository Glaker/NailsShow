// Editar una fórmula vigente = versión nueva (20261023170000, D-nuevo-producto-3).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como(DT);
const prod = (await uno(`insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('NV-1', 'Aceite', 24) returning id`)).id;
const v1 = (
  await uno(`insert into gmp.formulas_fabricacion (producto_id, variedad, version, densidad_producto) values ($1, 'Aire', '1', 0.854) returning id`, [prod])
).id;
await q(`insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp, es_csp) values ($1, 1, 'Vaselina', null, true)`, [v1]);
await q(`insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp) values ($1, 2, 'Jojoba', 0.75)`, [v1]);
await q(`insert into gmp.formula_procedimientos (formula_id, texto) values ($1, 'Mezclar')`, [v1]);
await q(`update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = $1`, [v1]);

let v2;
await como('naza@x');
await prueba('«Editar» crea la v2 en borrador con lo mismo', async () => {
  v2 = (await uno(`select gmp.nueva_version_formula($1) id`, [v1])).id;
  const f = await uno(`select version, variedad, estado, densidad_producto::float d from gmp.formulas_fabricacion where id = $1`, [v2]);
  if (f.version !== '2' || f.variedad !== 'Aire' || f.estado !== 'BORRADOR' || f.d !== 0.854) throw new Error(JSON.stringify(f));
  const c = await uno(`select count(*)::int n from gmp.formula_componentes where formula_id = $1`, [v2]);
  const p = await uno(`select texto from gmp.formula_procedimientos where formula_id = $1`, [v2]);
  if (c.n !== 2 || p.texto !== 'Mezclar') throw new Error(JSON.stringify({ c, p }));
});
await prueba('si ya hay un borrador, lleva a ese', async () => {
  const otra = (await uno(`select gmp.nueva_version_formula($1) id`, [v1])).id;
  if (otra !== v2) throw new Error('creó otra');
});
await prueba('la v2 se edita', async () => {
  await q(`update gmp.formula_componentes set porcentaje_pp = 0.8 where formula_id = $1 and orden = 2`, [v2]);
});
await rechaza('Naza no la deja vigente', `update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = '${v2}'`, /Dirección Técnica/);
await como(DT);
await prueba('DT la deja vigente y la v1 queda dada de baja, con fecha', async () => {
  await q(`update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = $1`, [v2]);
  const r = await q(`select version, estado, vigencia_hasta is not null h from gmp.formulas_fabricacion where producto_id = $1 order by version`, [prod]);
  if (r[0].estado !== 'DADO_DE_BAJA' || !r[0].h || r[1].estado !== 'VIGENTE') throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
