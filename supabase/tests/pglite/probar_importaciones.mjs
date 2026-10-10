// Fase 6 del módulo de costos (20261009170000): importación con registro.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
const H = 'a'.repeat(64);

await invariantes();
await como('gaby@x');
await prueba('importa los renglones en una transacción y deja el registro', async () => {
  const filas = [
    { codigo_insumo: '101ESE', importe: 18000, cantidad: 1, unidad: 'l', moneda: 'ARS', vigente_desde: '2026-10-01' },
    { codigo_insumo: '080ENV', importe: 0.35, cantidad: 1, unidad: 'UNIDAD', moneda: 'USD', tipo_cambio: 1500 },
  ];
  const n = await uno(`select comercial.importar_costos_referencia('costos_oct.xlsx', $1, $2::jsonb) n`, [H, JSON.stringify(filas)]);
  const r = await uno(`select origen, costo_unitario_ars from comercial.v_costo_referencia where codigo_interno = '080ENV'`);
  const i = await uno(`select filas, hash_archivo, importado_por from comercial.importaciones`);
  if (n.n !== 2 || r.origen !== 'MANUAL' || Math.abs(Number(r.costo_unitario_ars) - 525) > 1e-6 || i.filas !== 2 || i.hash_archivo !== H || !i.importado_por)
    throw new Error(JSON.stringify({ n, r, i }));
});
await prueba('si un renglón falla no entra ninguno, y dice cuál', async () => {
  const antes = (await uno(`select count(*)::int n from comercial.costos_referencia`)).n;
  let msg = null;
  try {
    await db.exec('savepoint x');
    await q(`select comercial.importar_costos_referencia('mal.xlsx', $1, $2::jsonb)`, [H, JSON.stringify([
      { codigo_insumo: '101ESE', importe: 19000, unidad: 'l' },
      { codigo_insumo: 'NOEXISTE', importe: 1, unidad: 'g' },
    ])]);
  } catch (e) { msg = e.message; } finally { await db.exec('rollback to savepoint x'); }
  const despues = (await uno(`select count(*)::int n from comercial.costos_referencia`)).n;
  if (!/Renglón 2/.test(msg ?? '') || antes !== despues) throw new Error(JSON.stringify({ msg, antes, despues }));
});
await rechaza('una unidad que no se convierte se rechaza con el renglón', `select comercial.importar_costos_referencia('u.xlsx', '${H}', '[{"codigo_insumo":"080ENV","importe":1,"unidad":"kg"}]'::jsonb)`, /Renglón 1.*No se puede pasar/);
await rechaza('un hash que no es SHA-256', `select comercial.importar_costos_referencia('h.xlsx', 'abc', '[{"codigo_insumo":"101ESE","importe":1,"unidad":"l"}]'::jsonb)`, /SHA-256/);
await rechaza('nadie escribe un registro de importación a mano', `insert into comercial.importaciones (plantilla, archivo, hash_archivo, filas, datos) values ('costos_materias_primas','falso.xlsx','${H}',5,'[]')`, /no se carga a mano/);
await rechaza('una fecha que no es AAAA-MM-DD no se interpreta', `select comercial.importar_costos_referencia('f.xlsx', '${H}', '[{"codigo_insumo":"101ESE","importe":1,"unidad":"l","vigente_desde":"01/10/2026"}]'::jsonb)`, /AAAA-MM-DD/);
await rechaza('un importe escrito como texto no se interpreta', `select comercial.importar_costos_referencia('t.xlsx', '${H}', '[{"codigo_insumo":"101ESE","importe":"12.000","unidad":"l"}]'::jsonb)`, /como número/);
await rechaza('una fecha imposible dice el renglón', `select comercial.importar_costos_referencia('d.xlsx', '${H}', '[{"codigo_insumo":"101ESE","importe":1,"unidad":"l","vigente_desde":"2026-02-30"}]'::jsonb)`, /Renglón 1/);
await como('diego@x');
await rechaza('Administración no fija costos de referencia', `select comercial.importar_costos_referencia('d.xlsx', '${H}', '[{"codigo_insumo":"101ESE","importe":1,"unidad":"l"}]'::jsonb)`, /Finanzas/);
await prueba('Administración ve el registro de importaciones', async () => {
  const r = await uno(`select count(*)::int n from comercial.importaciones`);
  if (r.n !== 1) throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
