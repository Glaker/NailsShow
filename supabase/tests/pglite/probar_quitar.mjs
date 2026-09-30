import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
const [a, b, c] = (await q(`select id from gmp.insumos_catalogo order by codigo_interno limit 3`)).map((r) => r.id);
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;

// ------------------------------ Fórmula ------------------------------
await como(DT);
const f = (await uno(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`, [prod])).id;
const comp = async (orden, insumo, pp) =>
  (await uno(`insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1,$2,$3,$4) returning id`, [f, orden, insumo, pp])).id;
await comp(1, a, 60);
await comp(2, b, 40);
const sobra = await comp(3, c, 30);
await rechaza('nadie borra un componente', `delete from gmp.formula_componentes where id='${sobra}'`, /permission denied/);
await prueba('la DT quita un componente: queda anulado, con autor y fecha', async () => {
  await q(`update gmp.formula_componentes set anulado=true where id=$1`, [sobra]);
  const r = await uno(`select anulado, anulado_por, anulado_en from gmp.formula_componentes where id=$1`, [sobra]);
  if (!r.anulado || !r.anulado_por || !r.anulado_en) throw new Error(JSON.stringify(r));
});
await rechaza('un anulado no se reactiva', `update gmp.formula_componentes set anulado=false where id='${sobra}'`, /ya se quitó/);
await prueba('su orden queda libre para otro componente', async () => {
  const id = await comp(3, c, 0);
  await q(`update gmp.formula_componentes set anulado=true where id=$1`, [id]);
});
await prueba('la suma ignora lo anulado: 60 + 40 pasa a vigente', async () => {
  await q(`update gmp.formulas_fabricacion set estado='VIGENTE', densidad_producto=1, densidad_temp_c=20 where id=$1`, [f]);
});
await prueba('la calculadora ignora lo anulado', async () => {
  const r = await q(`select * from gmp.calcular_lote($1, p_masa_kg => 10)`, [f]);
  if (r.length !== 2 || Number(r[0].masa_kg) !== 6) throw new Error(JSON.stringify(r));
});
await rechaza('en una fórmula vigente no se quita nada', `update gmp.formula_componentes set anulado=true where formula_id='${f}' and orden=1`, /vigente/);

// ------------------------- Lista de materiales -------------------------
await como('naza@x');
const mat = (await uno(`insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad) values ($1,$2,1) returning id`, [prod, a])).id;
await rechaza('nadie borra un material', `delete from gmp.materiales_acondicionamiento where id='${mat}'`, /permission denied/);
await prueba('Producción quita un material y lo vuelve a agregar', async () => {
  await q(`update gmp.materiales_acondicionamiento set activo=false where id=$1`, [mat]);
  await q(`insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad) values ($1,$2,2)`, [prod, a]);
});
await rechaza('dos vigentes del mismo insumo, no', `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad) values ('${prod}','${a}',3)`, /duplicate|unique/);
await rechaza('un material quitado no se reactiva', `update gmp.materiales_acondicionamiento set activo=true where id='${mat}'`, /ya se quitó/);

await invariantes();
fin();
