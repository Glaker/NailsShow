// Los «código PACK» de la lista pasan a venderse por unidad (20261110150000/150100).
import { readFileSync } from 'node:fs';
import { banco } from './lib.mjs';
const { db, q, uno, prueba, usuario, fin, invariantes } = await banco();
await usuario('nailshowargentina@hotmail.com', 'ADMINISTRACION', 'ADMINISTRACION');
await db.exec('reset role');
const antes = await q(
  `select codigo_interno, precio_promo, unidades_pack from comercial.v_lista_mayorista where codigo_interno ~* '^[0-9]+pack$' order by 1`,
);
await prueba('hay PACK en la lista de prueba', async () => {
  if (antes.length < 20) throw new Error(String(antes.length));
});
await prueba('la carga corre', async () => {
  await db.exec(
    readFileSync('../../migrations/20261110150100_carga_lista_codigos_pack_a_unidad.sql', 'utf8'),
  );
});
await db.exec('reset role');
await prueba('sin PACK numéricos en la lista vigente', async () => {
  const r = await q(
    `select codigo_interno from comercial.v_lista_mayorista where codigo_interno ~* '^[0-9]+pack$'`,
  );
  const quedan = r.map((x) => x.codigo_interno).filter((c) => !/^63[23]PACK$/i.test(c));
  if (quedan.length) throw new Error(quedan.join(','));
});
await prueba('el 82 entra por unidad con el precio del 82PACK', async () => {
  const p = antes.find((x) => x.codigo_interno === '82PACK');
  const u = await uno(
    `select precio_promo, unidades_pack from comercial.v_lista_mayorista where codigo_interno='82'`,
  );
  if (!u || Number(u.precio_promo) !== Number(p.precio_promo) || u.unidades_pack !== 1)
    throw new Error(JSON.stringify(u));
});
await prueba('la historia del PACK sigue en la tabla', async () => {
  const r = await uno(
    `select count(*)::int n from comercial.lista_mayorista l join gmp.productos p on p.id=l.producto_id where p.codigo_interno='82PACK'`,
  );
  if (r.n < 2) throw new Error(String(r.n));
});
await invariantes();
await fin();
