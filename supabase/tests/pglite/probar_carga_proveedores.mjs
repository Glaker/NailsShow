// Carga del listado unificado de proveedores (20261023150000).
import { readFileSync, readdirSync } from 'node:fs';
import { banco } from './lib.mjs';
const { db, q, uno, prueba, fin, invariantes } = await banco();
await db.exec('reset role');

const total = async () => (await uno(`select count(*)::int n from gmp.proveedores`)).n;

await prueba('las altas nuevas entran pendientes, a nombre del codirector técnico', async () => {
  const r = await uno(
    `select p.estado_aprobacion e, p.domicilio, p.observaciones, u.email from gmp.proveedores p
       join core.usuarios u on u.id = p.creado_por where p.cuit = '30709444286'`,
  );
  if (r.e !== 'PENDIENTE' || !r.domicilio.startsWith('Suipacha 355') || !r.observaciones.includes('SHELL') || r.email !== 'salta.agustin@gmail.com')
    throw new Error(JSON.stringify(r));
});
await prueba('están las 584 con CUIT, sin CUIT repetido', async () => {
  const r = await uno(`select count(cuit)::int c, count(distinct cuit)::int d from gmp.proveedores`);
  if (r.c !== 584 || r.d !== 584) throw new Error(JSON.stringify(r));
});
await prueba('los que ya estaban no se duplican: se completan y siguen como estaban', async () => {
  const r = await q(
    `select upper(btrim(razon_social)) n, count(*)::int c from gmp.proveedores group by 1 having count(*) > 1`,
  );
  if (r.length) throw new Error(JSON.stringify(r));
});
await prueba('correrla otra vez no cambia nada', async () => {
  const antes = await total();
  const nombre = '20261023150000_carga_proveedores_unificado.sql';
  const borr = new URL('./borradores/', import.meta.url);
  const ruta = readdirSync(borr).includes(nombre)
    ? new URL(nombre, borr)
    : new URL(`../../migrations/${nombre}`, import.meta.url);
  await db.exec(readFileSync(ruta, 'utf8'));
  if ((await total()) !== antes) throw new Error(`${antes} → ${await total()}`);
});
await prueba('quedó auditado', async () => {
  const r = await uno(`select count(*)::int n from core.auditoria where tabla = 'proveedores' and operacion = 'INSERT'`);
  if (r.n < 600) throw new Error(String(r.n));
});
await invariantes();
fin();
