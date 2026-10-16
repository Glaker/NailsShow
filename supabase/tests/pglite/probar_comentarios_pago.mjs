// Solicitudes de pago: Gerencia de Producción ve todas y cualquiera que vea
// una solicitud le puede comentar (20261015120000), salvo el Administrador del
// sistema, que solo lee (20261015120100).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');
await usuario('op@x', 'OPERARIO');
await usuario('admsis@x', 'ADMINISTRADOR_SISTEMA', 'ADMINISTRACION');
await usuario('gerente@x', 'GERENCIA', 'ADMINISTRACION');
// Fuera de cualquier sesión: así la prueba de suplantación no depende de que
// Administración pueda leer core.usuarios.
const nazaId = (await uno(`select id from core.usuarios where email='naza@x'`)).id;

await como('ventas@x');
const sol = (
  await uno(
    `insert into comercial.solicitudes_pago (area, concepto, destinatario, importe, vencimiento) values ('ADMINISTRACION','Flete','Transportes Sur',8000, date '2026-10-20') returning id`,
  )
).id;

await como('naza@x');
await prueba('Gerencia de Producción ve la solicitud de otra área', async () => {
  const n = await uno(
    `select count(*)::int n from comercial.solicitudes_pago where id=$1`,
    [sol],
  );
  if (n.n !== 1) throw new Error(String(n.n));
});
await prueba(
  'pero no la aprueba (la política de UPDATE no le deja la fila)',
  async () => {
    const tocadas = await q(
      `update comercial.solicitudes_pago set estado='APROBADA' where id=$1 returning id`,
      [sol],
    );
    if (tocadas.length !== 0) throw new Error('la política dejó tocar la fila');
    const s = await uno(`select estado from comercial.solicitudes_pago where id=$1`, [
      sol,
    ]);
    if (s.estado !== 'PENDIENTE') throw new Error(s.estado);
  },
);
const propia = (
  await uno(
    `insert into comercial.solicitudes_pago (area, concepto, destinatario, importe) values ('PRODUCCION','Service balanza','Técnico Gómez',15000) returning id`,
  )
).id;

await como('diego@x');
await prueba('Administración comenta la solicitud de Naza, a su nombre', async () => {
  const c = await uno(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Pasame la factura antes del viernes') returning autor, creado_en`,
    [propia],
  );
  const yo = await uno(`select core.usuario_actual() u`);
  if (c.autor !== yo.u) throw new Error('autor');
});
await rechaza(
  'no se comenta a nombre de otro',
  `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto, autor) values ($1, 'x', $2)`,
  /row-level security|política|policy/i,
  [propia, nazaId],
);
await prueba('la hora la pone la base, no quien inserta', async () => {
  // Se deshace al final: el resto de la prueba cuenta un solo comentario.
  await db.exec('savepoint hora');
  const c = await uno(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto, creado_en) values ($1, 'con fecha vieja', timestamptz '2020-01-01') returning creado_en`,
    [propia],
  );
  await db.exec('rollback to savepoint hora');
  if (new Date(c.creado_en).getFullYear() === 2020) throw new Error('quedó la fecha del cliente');
});
await rechaza(
  'más de 2000 caracteres no',
  `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, repeat('a', 2001))`,
  /check/,
  [propia],
);
await rechaza(
  'un comentario no se edita',
  `update comercial.comentarios_solicitud_pago set texto = 'otra cosa'`,
  /permission denied/,
);
await rechaza(
  'ni se borra',
  `delete from comercial.comentarios_solicitud_pago`,
  /permission denied/,
);
await rechaza(
  'vacío no',
  `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ('${propia}', '   ')`,
  /check/,
);

await como('naza@x');
await prueba('Naza ve el comentario y responde', async () => {
  const n = await uno(
    `select count(*)::int n from comercial.comentarios_solicitud_pago where solicitud_id=$1`,
    [propia],
  );
  if (n.n !== 1) throw new Error(String(n.n));
  await q(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Te la paso mañana')`,
    [propia],
  );
});

await como('op@x');
await prueba('quien no ve la solicitud no ve sus comentarios', async () => {
  const n = await uno(`select count(*)::int n from comercial.comentarios_solicitud_pago`);
  if (n.n !== 0) throw new Error(String(n.n));
});
await rechaza(
  'ni le comenta',
  `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ('${propia}', 'hola')`,
  /row-level security|política|policy/i,
);

await como('admsis@x');
await prueba('el Administrador del sistema ve la solicitud y sus comentarios', async () => {
  const n = await uno(
    `select count(*)::int n from comercial.comentarios_solicitud_pago where solicitud_id=$1`,
    [propia],
  );
  if (n.n !== 2) throw new Error(String(n.n));
});
await rechaza(
  'pero no comenta: su acceso es de lectura',
  `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ('${propia}', 'hola')`,
  /row-level security|política|policy/i,
);
await prueba('salvo en una solicitud que cargó él, como cualquier solicitante', async () => {
  const suya = (
    await uno(
      `insert into comercial.solicitudes_pago (area, concepto, destinatario, importe) values ('ADMINISTRACION','Dominio web','Registrador',3000) returning id`,
    )
  ).id;
  await q(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Vence en noviembre')`,
    [suya],
  );
});

// Cada rama de la regla por separado (sol es de Ventas; Naza no la pidió).
await como('ventas@x');
await prueba('comenta el solicitante sin rol de gestión', async () => {
  await q(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Es urgente')`,
    [sol],
  );
});
await como('naza@x');
await prueba('comenta Gerencia de Producción una solicitud ajena', async () => {
  await q(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Lo vi')`,
    [sol],
  );
});
await como('gerente@x');
await prueba('comenta Gerencia', async () => {
  await q(
    `insert into comercial.comentarios_solicitud_pago (solicitud_id, texto) values ($1, 'Aprobado de palabra')`,
    [sol],
  );
});

await prueba('cada comentario queda en la auditoría', async () => {
  // La auditoría se mira como dueño (su RLS es de supervisión).
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria where tabla='comentarios_solicitud_pago' and operacion='INSERT'`,
  );
  if (a.n !== 6) throw new Error(String(a.n));
});
await prueba('índice sobre autor y función de trigger cerrada a anon', async () => {
  await db.exec('reset role');
  const i = await uno(
    `select count(*)::int n from pg_indexes where indexname='comentarios_solicitud_pago_autor_idx'`,
  );
  const f = await uno(
    `select has_function_privilege('anon', 'comercial.fn_comentario_solicitud_sello()', 'execute') x`,
  );
  if (i.n !== 1 || f.x !== false) throw new Error(JSON.stringify({ i, f }));
});

await invariantes();
fin();
