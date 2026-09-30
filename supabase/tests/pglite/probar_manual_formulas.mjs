import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, fin, invariantes } = await banco();
const N = (x) => Number(x ?? 0);
const MANUAL = 'manual_formulas_produccion_v10.pdf';
await como('verificacion@nailshow.com.ar');

const formulaDe = (codigo, extra = '') =>
  uno(`select f.* from gmp.formulas_fabricacion f join gmp.productos p on p.id = f.producto_id
        join gmp.formula_procedimientos pr on pr.formula_id = f.id
       where p.codigo_interno = $1 and pr.texto like '%' || $2 || '%' ${extra} order by f.creado_en desc limit 1`, [codigo, MANUAL]);

await prueba('44 fórmulas del manual, todas en borrador y con su procedimiento', async () => {
  const r = await uno(`select count(distinct f.id)::int n, count(*) filter (where f.estado <> 'BORRADOR')::int no_borrador
    from gmp.formula_procedimientos pr join gmp.formulas_fabricacion f on f.id = pr.formula_id where pr.texto like '%' || $1 || '%'`, [MANUAL]);
  if (r.n !== 44 || r.no_borrador !== 0) throw new Error(JSON.stringify(r));
});
await prueba('Glam y Jennifer Beauty dados de alta; 20 productos tercerizados', async () => {
  const r = await q(`select t.nombre, count(p.id)::int n from gmp.terceros t left join gmp.productos p on p.tercero_id = t.id group by t.nombre order by 1`);
  const m = Object.fromEntries(r.map((x) => [x.nombre, x.n]));
  if (m.Glam !== 3 || m['Jennifer Beauty'] !== 12 || m.Navi !== 5) throw new Error(JSON.stringify(m));
});
await prueba('ningún % suma 100 o más sin csp', async () => {
  const r = await q(`select formula_id, sum(porcentaje_pp) filter (where not es_csp) s, count(*) filter (where es_csp) csp
    from gmp.formula_componentes group by formula_id having count(*) filter (where es_csp) <> 1 or sum(porcentaje_pp) filter (where not es_csp) >= 100`);
  if (r.length) throw new Error(JSON.stringify(r));
});
// En la base alojada es la v2 (hay una v1 vigente cargada desde la app); acá, la primera.
await prueba('377 PREP: en masa (67,55 / 32,45), no los 70/30 de volumen', async () => {
  const f = await formulaDe('377');
  const c = await q(`select i.codigo_interno, c.porcentaje_pp, c.es_csp from gmp.formula_componentes c join gmp.insumos_catalogo i on i.id = c.insumo_id where c.formula_id = $1 order by c.orden`, [f.id]);
  if (!c[0].es_csp || N(c[1].porcentaje_pp) !== 32.4524) throw new Error(JSON.stringify({ f, c }));
});
await prueba('la calculadora devuelve los kg del manual (clarificador 1 L, 15,77 kg)', async () => {
  const f = await formulaDe('386');
  const r = await q(`select codigo_interno, masa_kg from gmp.calcular_lote($1, p_masa_kg => 15.77)`, [f.id]);
  const m = Object.fromEntries(r.map((x) => [x.codigo_interno, N(x.masa_kg)]));
  if (m['138CL1'] !== 12.59 || m['138CL2'] !== 3.14 || m['384ESE'] !== 0.04) throw new Error(JSON.stringify(m));
});
await prueba('cada aroma del sanitizante lleva sus pasos y su fragancia', async () => {
  for (const [sku, pigmento, fragancia] of [['391', 'ROSA OSCURO', '135FRA1'], ['393', 'CAMALEON LILA', '135FRA2'], ['396', 'VIOLETA #158', '135FRA3']]) {
    const f = await formulaDe(sku);
    const t = (await uno(`select texto from gmp.formula_procedimientos where formula_id = $1`, [f.id])).texto;
    const fr = await uno(`select 1 x from gmp.formula_componentes c join gmp.insumos_catalogo i on i.id = c.insumo_id where c.formula_id = $1 and i.codigo_interno = $2`, [f.id, fragancia]);
    if (!t.includes(pigmento) || !fr) throw new Error(sku);
  }
});
await prueba('los polímeros quedan sin componentes: las cucharadas no tienen peso', async () => {
  const f = await formulaDe('99');
  const n = await uno(`select count(*)::int n from gmp.formula_componentes where formula_id = $1`, [f.id]);
  const t = (await uno(`select texto from gmp.formula_procedimientos where formula_id = $1`, [f.id])).texto;
  if (n.n !== 0 || !t.includes('Ferrite')) throw new Error(JSON.stringify(n));
});
await prueba('crema de Jennifer Beauty: base csp sin composición y esencia al 0,6 %', async () => {
  const c = await q(`select c.nombre_libre, c.porcentaje_pp, c.es_csp from gmp.formula_componentes c
    join gmp.formulas_fabricacion f on f.id = c.formula_id join gmp.productos p on p.id = f.producto_id
   where p.nombre = 'CREMA HUMECTANTE JENNIFER BEAUTY 200g FRUTOS ROJOS' order by c.orden`);
  if (c.length !== 2 || !c[0].es_csp || N(c[1].porcentaje_pp) !== 0.6) throw new Error(JSON.stringify(c));
});
await como('salta.agustin@gmail.com', 'DIRECCION_TECNICA');
await rechaza('una fórmula con base por nombre no se vuelve vigente sin completarla',
  `update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = (select f.id from gmp.formulas_fabricacion f join gmp.productos p on p.id = f.producto_id where p.nombre = 'CREMA HUMECTANTE JENNIFER BEAUTY 200g FRUTOS ROJOS')`,
  /Dirección Técnica|densidad|row-level|aprob/);

await invariantes();
fin();
