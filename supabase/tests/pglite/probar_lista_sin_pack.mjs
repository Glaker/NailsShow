// Los «código PACK» de la lista pasan a venderse por unidad, con el pack como
// mínimo, y los pedidos sin aprobar pasan a unidades (20261110150000/150100).
import { readFileSync } from 'node:fs';
import { banco } from './lib.mjs';
const { db, q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('nailshowargentina@hotmail.com', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await db.exec('reset role');
const antes = await q(
  `select codigo_interno, precio_promo, unidades_pack from comercial.v_lista_mayorista where codigo_interno ~* '^[0-9]+pack$' order by 1`,
);
await prueba('hay PACK en la lista de prueba', async () => {
  if (antes.length < 20) throw new Error(String(antes.length));
});

// Un pedido de venta esperando fecha con 82PACK × 3.
await como('mati@x');
const ped = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, es_venta) values ('V-PK','Kiosco',true) returning id`,
  )
).id;
await q(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
   values ($1, (select id from gmp.productos where codigo_interno='82PACK'), 3)`,
  [ped],
);
await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [ped]);
await db.exec('reset role');

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
await prueba('el 82 entra por unidad con el precio del 82PACK y el pack de mínimo', async () => {
  const p = antes.find((x) => x.codigo_interno === '82PACK');
  const u = await uno(
    `select precio_promo, unidades_pack, minimo from comercial.v_lista_mayorista where codigo_interno='82'`,
  );
  if (!u || Number(u.precio_promo) !== Number(p.precio_promo) || u.unidades_pack !== 1)
    throw new Error(JSON.stringify(u));
  if (p.unidades_pack > 1 && Number(u.minimo) !== p.unidades_pack)
    throw new Error(`mínimo ${u.minimo}, pack ${p.unidades_pack}`);
});
await prueba('el pedido pasa a unidades: 82 × 3·pack y el PACK anulado', async () => {
  const n = antes.find((x) => x.codigo_interno === '82PACK').unidades_pack;
  const r = await q(
    `select p.codigo_interno c, r.cantidad, r.anulado
       from comercial.pedido_renglones r join gmp.productos p on p.id = r.producto_id
      where r.pedido_id = $1 order by 1`,
    [ped],
  );
  const u = r.find((x) => x.c === '82' && !x.anulado);
  const pk = r.find((x) => x.c === '82PACK');
  if (!u || Number(u.cantidad) !== 3 * n || !pk.anulado) throw new Error(JSON.stringify(r));
});
await prueba('la historia del PACK sigue en la tabla', async () => {
  const r = await uno(
    `select count(*)::int n from comercial.lista_mayorista l join gmp.productos p on p.id=l.producto_id where p.codigo_interno='82PACK'`,
  );
  if (r.n < 2) throw new Error(String(r.n));
});
await invariantes();
await fin();
