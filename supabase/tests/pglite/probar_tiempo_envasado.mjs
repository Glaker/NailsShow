// Tiempo de envasado por producto (20261022160000, D-tiempo-envasado-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');

await como('naza@x');
const p = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('SAN-1', 'Sanitizante', 36) returning id`,
  )
).id;

await prueba('arranca sin tiempo, con 10 % de margen y una persona', async () => {
  const r = await uno(
    `select minutos_envasado_unidad m, margen_envasado_pct::int g, personas_envasado n from gmp.productos where id = $1`,
    [p],
  );
  if (r.m !== null || r.g !== 10 || r.n !== 1) throw new Error(JSON.stringify(r));
});
await prueba('Naza carga 1 minuto por unidad, 3 personas y 15 %', async () => {
  const r = await q(
    `update gmp.productos set minutos_envasado_unidad = 1, personas_envasado = 3, margen_envasado_pct = 15
      where id = $1 returning id`,
    [p],
  );
  if (r.length !== 1) throw new Error('no actualizó');
});
await prueba('y 45 segundos de etiquetado, sin redondear (D-ajustes-2)', async () => {
  const r = await uno(
    `update gmp.productos set minutos_etiquetado_unidad = 45 / 60.0, minutos_envasado_unidad = 1 / 60.0
      where id = $1 returning round(minutos_etiquetado_unidad * 60, 3) e, round(minutos_envasado_unidad * 60, 3) v`,
    [p],
  );
  if (Number(r.e) !== 45 || Number(r.v) !== 1) throw new Error(JSON.stringify(r));
});
await rechaza(
  'un etiquetado de cero no entra',
  `update gmp.productos set minutos_etiquetado_unidad = 0 where id = '${p}'`,
  /check/i,
);
await rechaza(
  'un tiempo de cero no entra',
  `update gmp.productos set minutos_envasado_unidad = 0 where id = '${p}'`,
  /check/i,
);
await rechaza(
  'ni cero personas',
  `update gmp.productos set personas_envasado = 0 where id = '${p}'`,
  /check/i,
);
await como('ventas@x');
await prueba('Ventas no lo cambia (la política no le deja la fila)', async () => {
  const r = await q(
    `update gmp.productos set minutos_envasado_unidad = 9 where id = $1 returning id`,
    [p],
  );
  if (r.length !== 0) throw new Error('lo cambió');
});
await prueba('el cambio quedó auditado a nombre de Naza', async () => {
  await db.exec('reset role');
  const r = await uno(
    `select count(*)::int n from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.tabla = 'productos' and a.operacion = 'UPDATE' and u.email = 'naza@x'`,
  );
  if (r.n < 1) throw new Error('sin auditoría');
});
await invariantes();
fin();
