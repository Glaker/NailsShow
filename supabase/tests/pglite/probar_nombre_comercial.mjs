// Nombre comercial y alias en el portal (migración 20261113200000, P2).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('admin@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('ven@x', 'VENTAS', 'ADMINISTRACION');
await usuario('op@x', 'OPERARIO');
await usuario('cc@x', 'CONTROL_CALIDAD');
await usuario('cli1@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('demo@x', 'CLIENTE', 'ADMINISTRACION');
await q(`update core.usuarios set es_ejemplo = true where email = 'demo@x'`);
const ids = new Map(
  (await q(`select email, id from core.usuarios`)).map((x) => [x.email, x.id]),
);
const id = (e) => ids.get(e);

const base = new Map(
  (await q(`select codigo_interno c, nombre n from gmp.productos`)).map((x) => [
    x.c,
    x.n,
  ]),
);
const pid = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const hum = await pid('370');
const exf = await pid('364');
const sin = await pid('101');

await como('admin@x');
const cliente = (
  await uno(
    `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento)
     values ('Kiosco Uno','CONSUMIDOR_FINAL','DNI','12345678') returning id`,
  )
).id;
await q(
  `insert into comercial.clientes_usuarios (usuario_id, cliente_id) values ($1,$2)`,
  [id('cli1@x'), cliente],
);
// Precio de lista para que los tres productos salgan seguro en cliente_lista().
for (const p of [hum, exf, sin])
  await q(
    `insert into comercial.lista_mayorista (producto_id, numero_lista, precio_lista, precio_promo)
     values ($1,'T',1000,900)`,
    [p],
  );
// La carga de la migración puede no haber corrido (sin DT): se aseguran las filas.
await q(
  `insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial, alias) values
   ($1,'Crema humectante Amor 240 ml','{crema,cremas,humectante,humectantes}'),
   ($2,'Crema exfoliante Amor 240 ml','{crema,cremas,exfoliante,exfoliantes}')
   on conflict do nothing`,
  [hum, exf],
);

const comoCliente = async (email) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ usuario_id: id(email), rol: null, roles: [], es_cliente: true }),
  ]);
  await db.exec('set role authenticated');
};
const lista = () =>
  q(`select producto_id, producto, alias from comercial.cliente_lista()`);
// Búsqueda como la del portal: el texto (sin distinguir mayúsculas) en el nombre o en un alias.
const busca = (l, t) => {
  const n = t.toLowerCase();
  return new Set(
    l
      .filter((x) => x.producto.toLowerCase().includes(n) || x.alias.some((a) => a === n))
      .map((x) => x.producto_id),
  );
};

for (const [quien, email] of [
  ['el cliente', 'cli1@x'],
  ['el cliente demo', 'demo@x'],
]) {
  await comoCliente(email);
  await prueba(
    `${quien} ve nombre comercial y alias; el resto conserva el de gmp`,
    async () => {
      const l = await lista();
      const h = l.find((x) => x.producto_id === hum);
      const s = l.find((x) => x.producto_id === sin);
      if (!h || !s) throw new Error('faltan productos en la lista');
      if (h.producto !== 'Crema humectante Amor 240 ml' || !h.alias.includes('crema'))
        throw new Error(JSON.stringify(h));
      if (s.producto !== base.get('101') || s.alias.length !== 0)
        throw new Error(JSON.stringify(s));
    },
  );
  await prueba(
    `${quien} encuentra por crema, CREMA, cremas, humectante y exfoliante`,
    async () => {
      const l = await lista();
      for (const t of ['crema', 'CREMA', 'cremas']) {
        const r = busca(l, t);
        if (!r.has(hum) || !r.has(exf)) throw new Error(t);
        if (r.has(sin)) throw new Error(t + ' trae un producto ajeno');
      }
      const h = busca(l, 'humectante');
      if (!h.has(hum) || h.has(exf)) throw new Error('humectante');
      const e = busca(l, 'exfoliante');
      if (!e.has(exf) || e.has(hum)) throw new Error('exfoliante');
    },
  );
}
await prueba('el cliente no lee la tabla directo', async () => {
  await como('ven@x');
  const i = await uno(`select count(*)::int n from comercial.productos_nombre_comercial`);
  if (i.n < 1) throw new Error('un rol interno debería ver filas: ' + i.n);
  await comoCliente('cli1@x');
  const r = await uno(`select count(*)::int n from comercial.productos_nombre_comercial`);
  if (r.n !== 0) throw new Error(String(r.n));
});
await comoCliente('cli1@x');
await rechaza(
  'el cliente no inserta',
  `insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial) values ('${sin}','x')`,
  /row-level security|permission/,
);

for (const email of ['op@x', 'cc@x']) {
  await como(email);
  await prueba(`${email}: ve la tabla`, async () => {
    const r = await uno(
      `select count(*)::int n from comercial.productos_nombre_comercial`,
    );
    if (r.n < 1) throw new Error(String(r.n));
  });
  await rechaza(
    `${email}: no inserta`,
    `insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial, actualizado_por)
     values ('${sin}','x','${id(email)}')`,
    /row-level security/,
  );
  // Sin política de UPDATE para su rol el UPDATE no alcanza filas: no falla, afecta 0.
  await prueba(`${email}: el UPDATE no toca nada`, async () => {
    const r = await db.query(
      `update comercial.productos_nombre_comercial set nombre_comercial='hack'`,
    );
    if (r.affectedRows !== 0) throw new Error(String(r.affectedRows));
  });
}

await como('ven@x');
await prueba('Ventas actualiza y la auditoría guarda el valor anterior', async () => {
  const r = await db.query(
    `update comercial.productos_nombre_comercial set nombre_comercial='Crema humectante Amor 240 ml (nueva)'
      where producto_id=$1`,
    [hum],
  );
  if (r.affectedRows !== 1) throw new Error('no actualizó: ' + r.affectedRows);
  await db.exec('reset role');
  const a = await uno(
    `select datos_antes->>'nombre_comercial' a, datos_despues->>'nombre_comercial' d, usuario_id
       from core.auditoria
      where tabla='productos_nombre_comercial' and operacion='UPDATE' and datos_antes->>'producto_id'=$1`,
    [hum],
  );
  if (
    !a ||
    a.a !== 'Crema humectante Amor 240 ml' ||
    !a.d.endsWith('(nueva)') ||
    a.usuario_id !== id('ven@x')
  )
    throw new Error(JSON.stringify(a));
});
await prueba('actualizado_en se refresca en el UPDATE', async () => {
  await db.exec('reset role');
  await q(
    `update comercial.productos_nombre_comercial set actualizado_en = now() - interval '1 day' where producto_id=$1`,
    [exf],
  );
  await q(
    `update comercial.productos_nombre_comercial set nombre_comercial = nombre_comercial where producto_id=$1`,
    [exf],
  );
  const r = await uno(
    `select actualizado_en > now() - interval '1 hour' ok from comercial.productos_nombre_comercial where producto_id=$1`,
    [exf],
  );
  if (!r.ok) throw new Error('no se refrescó');
});
await como('ven@x');
await rechaza(
  'no se cambia producto_id',
  `update comercial.productos_nombre_comercial set producto_id='${sin}' where producto_id='${hum}'`,
  /No se cambia el producto/,
);
await prueba(
  'el UPDATE sella actualizado_por con la sesión aunque se intente otro',
  async () => {
    await db.query(
      `update comercial.productos_nombre_comercial set actualizado_por='${id('admin@x')}' where producto_id=$1`,
      [hum],
    );
    const r = await uno(
      `select actualizado_por from comercial.productos_nombre_comercial where producto_id=$1`,
      [hum],
    );
    if (r.actualizado_por !== id('ven@x')) throw new Error(r.actualizado_por);
  },
);
await rechaza(
  'actualizado_por ajeno rechazado en INSERT',
  `insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial, actualizado_por)
   values ('${sin}','x','${id('admin@x')}')`,
  /row-level security/,
);
await rechaza(
  'DELETE denegado',
  `delete from comercial.productos_nombre_comercial where producto_id='${hum}'`,
  /permission denied|Prohibido borrar/,
);
for (const [n, a] of [
  ['con mayúsculas', '{Crema}'],
  ['vacío', '{""}'],
  ['con nulo', '{a,null}'],
])
  await rechaza(
    `alias ${n} rechazado`,
    `insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial, alias) values ('${sin}','x','${a}')`,
    /alias_limpio/,
  );

await db.exec('reset role');
await prueba('la inserción queda en la auditoría', async () => {
  const r = await uno(
    `select count(*)::int n from core.auditoria where tabla='productos_nombre_comercial' and operacion='INSERT'`,
  );
  if (r.n < 2) throw new Error(String(r.n));
  const s = await uno(
    `select count(*)::int n from core.auditoria where tabla='productos_nombre_comercial' and registro_id is null`,
  );
  if (s.n !== 0) throw new Error(`${s.n} filas sin registro_id`);
});
await prueba('gmp.productos.nombre no cambió', async () => {
  const r = await uno(`select nombre from gmp.productos where codigo_interno='370'`);
  if (r.nombre !== base.get('370')) throw new Error(r.nombre);
});
await prueba('RLS habilitada y forzada', async () => {
  const r = await uno(
    `select relrowsecurity a, relforcerowsecurity b from pg_class where oid='comercial.productos_nombre_comercial'::regclass`,
  );
  if (!r.a || !r.b) throw new Error(JSON.stringify(r));
});

await invariantes();
await fin();
