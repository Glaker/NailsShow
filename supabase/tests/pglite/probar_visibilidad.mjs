import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
const ADMIN = 'verificacion@nailshow.com.ar';
await como(ADMIN);
await prueba('el administrador oculta una pestaña para Ventas y lo puede revertir', async () => {
  await q(`select core.fijar_visibilidad('/stock?vista=insumos', 'VENTAS', false, 'Mati no maneja materia prima')`);
  await q(`select core.fijar_visibilidad('/stock?vista=insumos', 'VENTAS', true)`);
  const r = await uno(`select visible, cambiado_por, motivo from core.visibilidad_pantallas where pantalla='/stock?vista=insumos' and rol='VENTAS'`);
  if (r.visible !== true || !r.cambiado_por || r.motivo !== null) throw new Error(JSON.stringify(r));
});
await como('diego@x');
await prueba('el administrador ve la tesorería', async () => {
  await q(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja','CAJA')`);
  await como(ADMIN);
  const n = await uno(`select count(*)::int n from comercial.cuentas_fondos`);
  if (n.n !== 1) throw new Error(String(n.n));
});
await rechaza('pero no la escribe', `insert into comercial.cuentas_fondos (nombre, tipo) values ('Otra','CAJA')`, /row-level/);
await como('mati@x');
await prueba('cualquiera lee la configuración (para su menú)', async () => {
  const n = await uno(`select count(*)::int n from core.visibilidad_pantallas`);
  if (n.n !== 1) throw new Error(String(n.n));
});
await rechaza('Ventas no cambia la visibilidad', `select core.fijar_visibilidad('/stock', 'VENTAS', true)`, /row-level/);
await rechaza('pantalla sin barra', `select core.fijar_visibilidad('stock', 'VENTAS', true)`, /check|row-level/);
await invariantes();
fin();
