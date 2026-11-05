// Familias de SKU: la fórmula vigente de una presentación pasa a las demás
// de su familia y variante (20261105170000, D-familias-sku-1).
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('dt@x', 'DIRECCION_TECNICA');
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await como('dt@x');

const prod = async (codigo, familia, variante) =>
  (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses, familia, variante)
       values ($1, $1, 24, $2, $3) returning id`,
      [codigo, familia, variante],
    )
  ).id;
const ins = async (codigo) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
       values ($1, $1, 'MATERIA_PRIMA', 'kg') returning id`,
      [codigo],
    )
  ).id;
const formula = async (producto, comps, version = '1') => {
  const f = (
    await uno(
      `insert into gmp.formulas_fabricacion (producto_id, version, densidad_producto) values ($1, $2, 1) returning id`,
      [producto, version],
    )
  ).id;
  let o = 1;
  for (const [insumo, pp] of comps)
    await q(
      `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, $2, $3, $4)`,
      [f, o++, insumo, pp],
    );
  return f;
};
const vigente = (f) =>
  q(`update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = $1`, [f]);
const vigentesDe = (p) =>
  q(
    `select f.id, f.version, gmp.huella_formula(f.id) h, u.email
       from gmp.formulas_fabricacion f left join core.usuarios u on u.id = f.aprobada_por
      where f.producto_id = $1 and f.estado = 'VIGENTE'`,
    [p],
  );

const a240 = await prod('EX-A240', 'Exfoliante', 'AMOR');
const a100 = await prod('EX-A100', 'Exfoliante', 'AMOR');
const a50 = await prod('EX-A50', 'Exfoliante', 'AMOR');
const p240 = await prod('EX-P240', 'Exfoliante', 'PAZ');
const base = await ins('MP-BASE');
const fra = await ins('MP-FRA');
const granel = await ins('MP-GRANEL');

// La de 50 ml envasa un granel: no lleva la fórmula.
const env = await formula(a50, [[granel, 100]], 'Envasado');
await vigente(env);

const f1 = await formula(a240, [
  [base, 98],
  [fra, 2],
]);

await prueba(
  'al dejarla vigente, la de 100 ml recibe la misma, aprobada por la DT',
  async () => {
    await vigente(f1);
    const [v] = await vigentesDe(a100);
    const [o] = await vigentesDe(a240);
    if (!v || JSON.stringify(v.h) !== JSON.stringify(o.h))
      throw new Error(JSON.stringify(v));
    if (v.email !== 'dt@x' || v.version !== '1') throw new Error(JSON.stringify(v));
  },
);
await prueba('la otra fragancia y la de envasado no se tocan', async () => {
  if ((await vigentesDe(p240)).length !== 0) throw new Error('PAZ');
  const [v] = await vigentesDe(a50);
  if (v.version !== 'Envasado') throw new Error(v.version);
});
await prueba('una versión nueva reemplaza a la anterior en las dos', async () => {
  const f2 = await formula(
    a100,
    [
      [base, 97],
      [fra, 3],
    ],
    '2',
  );
  await vigente(f2);
  const [v] = await vigentesDe(a240);
  if (v.version !== '2' || Number(v.h[1][2]) !== 3) throw new Error(JSON.stringify(v));
  const bajas = await uno(
    `select count(*)::int n from gmp.formulas_fabricacion where producto_id = $1 and estado = 'DADO_DE_BAJA'`,
    [a240],
  );
  if (bajas.n !== 1) throw new Error(`bajas ${bajas.n}`);
});
await prueba('con los mismos componentes no se crea otra versión', async () => {
  const antes = await uno(`select count(*)::int n from gmp.formulas_fabricacion`);
  const f3 = await formula(
    a240,
    [
      [base, 97],
      [fra, 3],
    ],
    '3',
  );
  await vigente(f3);
  const despues = await uno(`select count(*)::int n from gmp.formulas_fabricacion`);
  if (despues.n !== antes.n + 1) throw new Error(`${antes.n} → ${despues.n}`);
});
await como('gp@x');
await rechaza(
  'variante sin familia no',
  `update gmp.productos set familia = null where id = '${p240}'`,
  /productos_variante_con_familia/,
);
await invariantes();
fin();
