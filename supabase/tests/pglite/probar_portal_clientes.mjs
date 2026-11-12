// Portal de clientes (20261110160000/160100): el cliente entra sin rol, no
// lee nada interno y solo maneja sus pedidos por las funciones cliente_*.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('admin@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('cli1@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('cli2@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('cli3@x', 'CLIENTE', 'ADMINISTRACION'); // sin vincular
const N = (x) => Number(x ?? 0);
const ids = new Map((await q(`select email, id from core.usuarios`)).map((x) => [x.email, x.id]));
const idDe = async (e) => ids.get(e);

await como('admin@x');
const cliente = async (r) =>
  (
    await uno(
      `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ($1,'CONSUMIDOR_FINAL','DNI',$2) returning id`,
      [r, String(Math.floor(Math.random() * 9e7) + 1e7)],
    )
  ).id;
const c1 = await cliente('Kiosco Uno');
const c2 = await cliente('Kiosco Dos');
await q(`insert into comercial.clientes_usuarios (usuario_id, cliente_id) values ($1,$2), ($3,$4)`, [
  await idDe('cli1@x'),
  c1,
  await idDe('cli2@x'),
  c2,
]);
await rechaza(
  'solo una cuenta Cliente se vincula',
  `insert into comercial.clientes_usuarios (usuario_id, cliente_id) values ('${await idDe('mati@x')}', '${c1}')`,
  /rol Cliente/,
);

// Sesión como la arma el hook para un cliente: sin rol.
const comoCliente = async (email) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ usuario_id: await idDe(email), rol: null, roles: [], es_cliente: true }),
  ]);
  await db.exec('set role authenticated');
};

await prueba('el hook emite al cliente sin rol', async () => {
  await db.exec('reset role');
  const au = '00000000-0000-0000-0000-00000000c111';
  // El alta en Auth crea la cuenta sin habilitar; se la habilita como Cliente.
  await q(`insert into auth.users (id, email) values ($1, 'hook@x')`, [au]);
  await q(`update core.usuarios set rol='CLIENTE', activo=true, fecha_baja=null where auth_user_id=$1`, [
    au,
  ]);
  const r = await uno(`select core.custom_access_token_hook($1::jsonb) e`, [
    JSON.stringify({ user_id: au, claims: {} }),
  ]);
  const c = r.e.claims;
  if (c.rol !== null || c.roles.length !== 0 || c.es_cliente !== true || !c.usuario_id)
    throw new Error(JSON.stringify(c));
});

const productos = (
  await q(
    `select producto_id from comercial.v_lista_mayorista where not es_regalo and precio_promo > 0 order by producto_id limit 3`,
  )
).map((x) => x.producto_id);
const [pA, pB, pC] = productos;

await comoCliente('cli1@x');
await prueba('el cliente no lee nada interno', async () => {
  for (const t of [
    'comercial.pedidos',
    'comercial.clientes',
    'comercial.movimientos_pt',
    'comercial.lista_mayorista',
    'core.v_nomina',
    'comercial.facturas',
  ]) {
    const r = await uno(`select count(*)::int n from ${t}`);
    if (r.n !== 0) throw new Error(`${t}: ${r.n}`);
  }
});
await prueba('ve la lista y la escala', async () => {
  const l = await uno(`select count(*)::int n from comercial.cliente_lista()`);
  if (l.n < 3) throw new Error(String(l.n));
  await q(`select * from comercial.cliente_escala()`);
  const p = await uno(`select comercial.cliente_perfil() p`);
  if (p.p.cliente !== 'Kiosco Uno') throw new Error(JSON.stringify(p));
});
let ped;
await prueba('envía un pedido', async () => {
  ped = (
    await uno(`select comercial.cliente_enviar_pedido(null, $1::jsonb, 'Para el lunes') id`, [
      JSON.stringify([
        { producto_id: pA, cantidad: 12 },
        { producto_id: pB, cantidad: 3 },
      ]),
    ])
  ).id;
  const r = await q(`select * from comercial.cliente_pedidos()`);
  if (r.length !== 1 || !r[0].editable || r[0].renglones.length !== 2) throw new Error(JSON.stringify(r));
});
await rechaza(
  'cantidades raras no',
  `select comercial.cliente_enviar_pedido(null, '[{"producto_id":"${pA}","cantidad":1.5}]'::jsonb)`,
  /entera/,
);
await prueba('lo corrige: cambia, saca y agrega', async () => {
  await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, null)`, [
    ped,
    JSON.stringify([
      { producto_id: pA, cantidad: 24 },
      { producto_id: pC, cantidad: 1 },
    ]),
  ]);
  const r = (await q(`select * from comercial.cliente_pedidos()`))[0];
  const m = new Map(r.renglones.map((x) => [x.producto_id, N(x.cantidad)]));
  if (m.size !== 2 || m.get(pA) !== 24 || m.get(pC) !== 1) throw new Error(JSON.stringify(r));
});

await comoCliente('cli2@x');
await prueba('otro cliente no lo ve', async () => {
  const r = await q(`select * from comercial.cliente_pedidos()`);
  if (r.length !== 0) throw new Error(JSON.stringify(r));
});
await rechaza(
  'ni lo toca',
  `select comercial.cliente_enviar_pedido('${ped}', '[{"producto_id":"${pA}","cantidad":1}]'::jsonb)`,
  /no es tuyo/,
);
await comoCliente('cli3@x');
await rechaza('sin vincular no entra', `select * from comercial.cliente_lista()`, /vinculada/);

await como('mati@x');
await prueba('Ventas lo ve, con precio y depósito', async () => {
  const p = await uno(
    `select numero, estado, enviado_por_cliente_en, deposito_origen_id, cliente_id from comercial.pedidos where id=$1`,
    [ped],
  );
  if (!p.enviado_por_cliente_en || !p.deposito_origen_id || p.cliente_id !== c1 || p.estado !== 'BORRADOR')
    throw new Error(JSON.stringify(p));
  const r = await q(
    `select precio_final from comercial.pedido_renglones where pedido_id=$1 and not anulado`,
    [ped],
  );
  if (r.length !== 2 || r.some((x) => x.precio_final === null)) throw new Error(JSON.stringify(r));
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [ped]);
});
await comoCliente('cli1@x');
await rechaza(
  'tomado por Ventas, ya no lo corrige',
  `select comercial.cliente_enviar_pedido('${ped}', '[{"producto_id":"${pA}","cantidad":1}]'::jsonb)`,
  /preparando/,
);
await rechaza('ni lo cancela', `select comercial.cliente_cancelar_pedido('${ped}')`, /preparando/);
await prueba('cancela uno nuevo', async () => {
  const id = (
    await uno(`select comercial.cliente_enviar_pedido(null, $1::jsonb) id`, [
      JSON.stringify([{ producto_id: pB, cantidad: 2 }]),
    ])
  ).id;
  await q(`select comercial.cliente_cancelar_pedido($1)`, [id]);
  const r = (await q(`select * from comercial.cliente_pedidos()`)).find((x) => x.id === id);
  if (!r.cancelado || r.editable) throw new Error(JSON.stringify(r));
});

// Estados para el cliente y finalizar (20261112120000).
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por)
   values ($1, (select id from gmp.depositos where numero='BER'), 'ENTRADA_DEVOLUCION', 50, 'stock de prueba', $2)`,
  [pB, await idDe('mati@x')],
);
await db.exec('set session_replication_role = origin');
const estadoCli = async (id) =>
  (await q(`select * from comercial.cliente_pedidos()`)).find((x) => x.id === id).estado_cliente;
await comoCliente('cli1@x');
const ped2 = (
  await uno(`select comercial.cliente_enviar_pedido(null, $1::jsonb) id`, [
    JSON.stringify([{ producto_id: pB, cantidad: 5 }]),
  ])
).id;
await prueba('recién enviado: Pendiente', async () => {
  if ((await estadoCli(ped2)) !== 'PENDIENTE') throw new Error(await estadoCli(ped2));
});
await como('mati@x');
await prueba('Mati reserva todo y aprueba: En camino', async () => {
  await q(
    `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad)
     values ($1, (select deposito_origen_id from comercial.pedidos where id=$2), $2, 5)`,
    [pB, ped2],
  );
  await q(`select comercial.aprobar_venta_reservada($1)`, [ped2]);
  await comoCliente('cli1@x');
  if ((await estadoCli(ped2)) !== 'EN_CAMINO') throw new Error(await estadoCli(ped2));
});
await como('mati@x');
await rechaza(
  'uno sin aprobar no se finaliza',
  `select comercial.finalizar_pedido_venta('${ped}')`,
  /aprobado/,
);
await prueba('Mati lo finaliza: Finalizado y sin reservas', async () => {
  await q(`select comercial.finalizar_pedido_venta($1, 'Lo retiró el cliente')`, [ped2]);
  const r = await uno(
    `select count(*)::int n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [ped2],
  );
  if (r.n !== 0) throw new Error(String(r.n));
  await comoCliente('cli1@x');
  if ((await estadoCli(ped2)) !== 'FINALIZADO') throw new Error(await estadoCli(ped2));
});
await comoCliente('cli1@x');
await rechaza(
  'el cliente no finaliza',
  `select comercial.finalizar_pedido_venta('${ped2}')`,
  /Ventas/,
);

await invariantes();
await fin();
