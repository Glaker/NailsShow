// Densidad supuesta de fragancias y pigmentos sin una cargada
// (20261105160000, D-densidad-supuesta-1).
import { banco } from './lib.mjs';
const { q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await como('gp@x');
const alta = async (codigo, nombre, tipo = 'MATERIA_PRIMA') =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
       values ($1, $2, $3, 'kg') returning densidad_referencia_id d`,
      [codigo, nombre, tipo],
    )
  ).d;
const densidad = async (id) =>
  id
    ? Number(
        (
          await uno(
            `select densidad_ref d from gmp.densidades_referencia where id = $1`,
            [id],
          )
        ).d,
      )
    : null;

await prueba('una fragancia nueva toma 0,98', async () => {
  if ((await densidad(await alta('900FRA1', 'FRAGANCIA 1234'))) !== 0.98)
    throw new Error('no');
  if ((await densidad(await alta('Kh-1', 'Esencia sandía'))) !== 0.98)
    throw new Error('esencia');
});
await prueba('un pigmento nuevo toma 2', async () => {
  if ((await densidad(await alta('900PIG', 'PIGMENTO rojo'))) !== 2)
    throw new Error('no');
});
await prueba('otra materia prima o un envase no toman nada', async () => {
  if ((await alta('900GLI', 'Glicerina')) !== null) throw new Error('glicerina');
  if ((await alta('900FRASCO', 'Frasco esencia 30 ml', 'MATERIAL_ENVASE')) !== null)
    throw new Error('envase');
});
await prueba('la fórmula estima con la supuesta', async () => {
  const fra = (
    await uno(`select id from gmp.insumos_catalogo where codigo_interno='900FRA1'`)
  ).id;
  const prod = (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('P-DS', 'Prueba', 24) returning id`,
    )
  ).id;
  const f = (
    await uno(
      `insert into gmp.formulas_fabricacion (producto_id, version) values ($1, '1') returning id`,
      [prod],
    )
  ).id;
  await q(
    `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, 1, $2, 100)`,
    [f, fra],
  );
  const e = await uno(`select densidad_real d from gmp.densidad_mezcla_formula($1, 20)`, [
    f,
  ]);
  if (Math.abs(e.d - 0.98) > 1e-9) throw new Error(String(e.d));
});
await invariantes();
fin();
