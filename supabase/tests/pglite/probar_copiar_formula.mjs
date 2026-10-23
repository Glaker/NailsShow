// Pegar componentes y procedimiento de otra fórmula (20261023160000, D-nuevo-producto-2).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como(DT);
const prodA = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const origen = (
  await uno(`insert into gmp.formulas_fabricacion (producto_id, version, densidad_producto) values ($1, '9', 0.95) returning id`, [prodA])
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp) values ($1, 1, 'Glicerina', 30)`,
  [origen],
);
await q(
  `insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp, es_csp) values ($1, 2, 'Agua', null, true)`,
  [origen],
);
await q(`insert into gmp.formula_procedimientos (formula_id, texto) values ($1, 'Mezclar en frío')`, [origen]);
await q(`update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = $1`, [origen]);

await como('naza@x');
const prodB = (await uno(`insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('CF-1', 'Copia', 24) returning id`)).id;
const destino = (await uno(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1, '1') returning id`, [prodB])).id;
await q(`insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp) values ($1, 1, 'Perfume', 1)`, [destino]);

await prueba('Naza pega los componentes al final, con la densidad', async () => {
  const n = (await uno(`select gmp.copiar_componentes($1, $2) n`, [origen, destino])).n;
  if (n !== 2) throw new Error(String(n));
  const c = await q(`select orden, coalesce(nombre_libre, '') n from gmp.formula_componentes where formula_id = $1 order by orden`, [destino]);
  if (c.map((x) => `${x.orden}:${x.n}`).join(',') !== '1:Perfume,2:Glicerina,3:Agua') throw new Error(JSON.stringify(c));
  const f = await uno(`select densidad_producto::float d from gmp.formulas_fabricacion where id = $1`, [destino]);
  if (f.d !== 0.95) throw new Error(JSON.stringify(f));
});
await rechaza('dos csp no', `select gmp.copiar_componentes('${origen}', '${destino}')`, /csp/);
await prueba('y trae el procedimiento: espera a DT', async () => {
  await q(`select gmp.copiar_procedimiento($1, $2)`, [origen, destino]);
  const p = await uno(`select texto, motivo_cambio, requiere_aprobacion r from gmp.formula_procedimientos where formula_id = $1`, [destino]);
  if (p.texto !== 'Mezclar en frío' || !p.motivo_cambio.includes('Copiado') || !p.r) throw new Error(JSON.stringify(p));
});
await rechaza('no se pega en una vigente', `select gmp.copiar_componentes('${destino}', '${origen}')`, /borrador/);
await como('ventas@x');
await rechaza('Ventas no copia', `select gmp.copiar_componentes('${origen}', '${destino}')`, /Gerencia de Producción o Dirección/);
await invariantes();
fin();
