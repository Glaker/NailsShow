// Hada (borradores 20261113220000 y 20261113220100, P6): el envío del pedido
// es idempotente por clave; reservar y cerrar cupo con límites por minuto y
// día, topes diario y mensual, demo apagada y clave del secreto; el cliente no
// lee ni escribe las tablas; tope por usuario y escalado a Sonnet reservado
// antes de llamarlo (20261113220300). Casos 10, 20 y 21 de docs/disenos/P6-hada.md.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('admin@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('sis@x', 'ADMINISTRADOR_SISTEMA', 'ADMINISTRACION');
await usuario('ger@x', 'GERENCIA', 'ADMINISTRACION');
await usuario('cli1@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('cli2@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('demo@x', 'CLIENTE', 'ADMINISTRACION');
const ids = new Map(
  (await q(`select email, id from core.usuarios`)).map((x) => [x.email, x.id]),
);
const idDe = (e) => ids.get(e);
await q(`update core.usuarios set es_ejemplo = true where email = 'demo@x'`);

// Las filas «de hace 2 minutos» y las del mes tienen que caer en el mismo día
// argentino que now(): si faltan menos de 200 s para la medianoche, se espera.
{
  const { s } = await uno(
    `select extract(epoch from (now() at time zone 'America/Argentina/Buenos_Aires')
            - date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires'))::float s`,
  );
  if (s < 200) await new Promise((ok) => setTimeout(ok, (200 - s) * 1000));
}

await como('admin@x');
const cliente = async (r) =>
  (
    await uno(
      `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ($1,'CONSUMIDOR_FINAL','DNI',$2) returning id`,
      [r, String(Math.floor(Math.random() * 9e7) + 1e7)],
    )
  ).id;
const [c1, c2] = [await cliente('Kiosco Uno'), await cliente('Kiosco Dos')];
await q(
  `insert into comercial.clientes_usuarios (usuario_id, cliente_id) values ($1,$2), ($3,$4)`,
  [idDe('cli1@x'), c1, idDe('cli2@x'), c2],
);
const [pA, pB] = (
  await q(
    `select producto_id from comercial.v_lista_mayorista where not es_regalo and precio_promo > 0 order by producto_id limit 2`,
  )
).map((x) => x.producto_id);

// Sesión como la arma el hook: cliente sin rol.
const comoCliente = async (email) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ usuario_id: idDe(email), rol: null, roles: [], es_cliente: true }),
  ]);
  await db.exec('set role authenticated');
};
const CLAVE = 'clave-hada-de-prueba-0123456789abcdef';
const reservar = async (c = CLAVE) =>
  (await uno(`select comercial.hada_reservar($1) r`, [c])).r;
const cerrar = async (id, c = CLAVE) =>
  (
    await uno(
      `select comercial.hada_cerrar($1,$2,'claude-haiku-5-5',1000,200,5000,0,'proponer_pedido','borrador',3,2,1,'{NO_ESTA}',800,null) r`,
      [c, id],
    )
  ).r;
const config = async (set) => {
  await db.exec('reset role');
  await q(`update comercial.hada_config set ${set}`);
};
const limpiar = async () => {
  await db.exec('reset role');
  await db.exec('alter table comercial.hada_interacciones disable trigger user');
  await db.exec('delete from comercial.hada_interacciones');
  await db.exec('alter table comercial.hada_interacciones enable trigger user');
};

// ---------------------------------------------------------------------------
// 21. Envío idempotente
// ---------------------------------------------------------------------------
const renglones = JSON.stringify([{ producto_id: pA, cantidad: 12 }]);
const K1 = '11111111-1111-4111-8111-111111111111';
let ped;
await comoCliente('cli1@x');
await prueba(
  'el envío con clave pasa los triggers de pedidos y el lock reentrante',
  async () => {
    ped = (
      await uno(`select comercial.cliente_enviar_pedido_unico($1,$2::jsonb,'x') id`, [
        K1,
        renglones,
      ])
    ).id;
    const r = await uno(`select count(*)::int n from comercial.cliente_pedidos()`);
    if (r.n !== 1) throw new Error(String(r.n));
  },
);
await prueba('misma clave: devuelve el mismo pedido, no crea otro', async () => {
  const otra = (
    await uno(`select comercial.cliente_enviar_pedido_unico($1,$2::jsonb,'x') id`, [
      K1,
      JSON.stringify([{ producto_id: pB, cantidad: 3 }]),
    ])
  ).id;
  const n = await uno(`select count(*)::int n from comercial.cliente_pedidos()`);
  if (otra !== ped || n.n !== 1) throw new Error(`${otra} ${ped} ${n.n}`);
});
await prueba('clave nueva: otro pedido', async () => {
  const otro = (
    await uno(`select comercial.cliente_enviar_pedido_unico($1,$2::jsonb) id`, [
      '22222222-2222-4222-8222-222222222222',
      renglones,
    ])
  ).id;
  if (otro === ped) throw new Error('mismo');
});
await rechaza(
  'sin clave no envía',
  `select comercial.cliente_enviar_pedido_unico(null, '${renglones}'::jsonb)`,
  /clave/,
);
await comoCliente('cli2@x');
await prueba('la misma clave en otro cliente es independiente', async () => {
  const otro = (
    await uno(`select comercial.cliente_enviar_pedido_unico($1,$2::jsonb) id`, [
      K1,
      renglones,
    ])
  ).id;
  if (otro === ped) throw new Error('mismo pedido');
  const n = await uno(`select count(*)::int n from comercial.cliente_pedidos()`);
  if (n.n !== 1) throw new Error(String(n.n));
});
await comoCliente('demo@x');
await rechaza(
  'la demo no envía (sin cliente)',
  `select comercial.cliente_enviar_pedido_unico('${K1}', '${renglones}'::jsonb)`,
  /vinculada/,
);

await prueba('la clave queda guardada en la fila', async () => {
  await db.exec('reset role');
  const f = await uno(
    `select clave_cliente::text k from comercial.pedidos where id = $1`,
    [ped],
  );
  if (f.k !== K1) throw new Error(String(f.k));
});
await prueba(
  'índice: misma clave y mismo cliente directo = unique_violation; otro cliente no',
  async () => {
    await db.exec('reset role');
    const K = '33333333-3333-4333-8333-333333333333';
    await db.query(`select set_config('comercial.portal_cliente','1',false)`);
    const ins = (n, c) =>
      q(
        `insert into comercial.pedidos (numero, cliente, cliente_id, clave_cliente) values ($1,'x',$2,$3)`,
        [n, c, K],
      );
    try {
      await ins('IDX-1', c1);
      await ins('IDX-3', c2); // otro cliente, misma clave
      let cod = null;
      await db.exec('savepoint ix');
      try {
        await ins('IDX-2', c1);
      } catch (e) {
        cod = e.code;
        await db.exec('rollback to savepoint ix');
      }
      if (cod !== '23505') throw new Error('código ' + cod);
    } finally {
      await db.query(`select set_config('comercial.portal_cliente','',false)`);
    }
  },
);
await como('mati@x');
await rechaza(
  'Ventas no inserta un pedido con clave_cliente',
  `insert into comercial.pedidos (numero, cliente, clave_cliente) values ('V-1','x', gen_random_uuid())`,
  /solo la fija el portal/,
);
await rechaza(
  'Ventas no cambia la clave de un pedido',
  `update comercial.pedidos set clave_cliente = gen_random_uuid() where id = '${ped}'`,
  /solo la fija el portal/,
);
await rechaza(
  'Ventas no anula la clave de un pedido',
  `update comercial.pedidos set clave_cliente = null where id = '${ped}'`,
  /solo la fija el portal/,
);

// ---------------------------------------------------------------------------
// 20. Lo que el cliente no puede
// ---------------------------------------------------------------------------
await comoCliente('cli1@x');
await rechaza(
  'hada_reservar con una clave cualquiera: sin privilegio',
  `select comercial.hada_reservar('x')`,
  /no autorizada|privilegio/,
);
await rechaza(
  'hada_cerrar con una clave cualquiera',
  `select comercial.hada_cerrar('x', gen_random_uuid(), 'm',0,0,0,0,null,null,0,0,0,null,0,null)`,
  /no autorizada/,
);
await prueba('sin hash cargado nadie reserva (falla cerrado)', async () => {
  let ok = false;
  try {
    await db.exec('savepoint h');
    await reservar(CLAVE);
    ok = true;
  } catch {
    await db.exec('rollback to savepoint h');
  }
  if (ok) throw new Error('reservó sin clave cargada');
});
await db.exec('reset role');
await q(
  `update comercial.hada_config set clave_sha256 = sha256(convert_to($1, 'UTF8')), activo = true`,
  [CLAVE],
);

await comoCliente('cli1@x');
await prueba('no lee las tablas', async () => {
  for (const t of ['comercial.hada_config', 'comercial.hada_interacciones']) {
    const r = await uno(`select count(*)::int n from ${t}`);
    if (r.n !== 0) throw new Error(`${t}: ${r.n}`);
  }
});
await rechaza(
  'no inserta en las interacciones',
  `insert into comercial.hada_interacciones (usuario_id, costo_usd) values (core.usuario_actual(), 0)`,
  /permission denied|row-level/,
);
await prueba('no toca la configuración (RLS: 0 filas)', async () => {
  const r = await q(`update comercial.hada_config set activo = true returning id`);
  if (r.length) throw new Error('tocó ' + r.length);
});
await rechaza(
  'no borra',
  `delete from comercial.hada_interacciones`,
  /permission denied/,
);
await como('mati@x');
await rechaza(
  'Ventas (rol interno) no reserva',
  `select comercial.hada_reservar('${CLAVE}')`,
  /solo para clientes/,
);

// ---------------------------------------------------------------------------
// Reservar y cerrar
// ---------------------------------------------------------------------------
await limpiar();
await comoCliente('cli1@x');
let fila;
await prueba(
  'reserva: devuelve id y los máximos, y deja la fila RESERVADA con el costo de reserva',
  async () => {
    const r = await reservar();
    if (
      !r.permitido ||
      r.max_lineas !== 25 ||
      r.max_unidades !== 500 ||
      r.max_cajas !== 50
    )
      throw new Error(JSON.stringify(r));
    fila = r.id;
    await db.exec('reset role');
    const f = await uno(
      `select estado, costo_usd::float c, es_demo from comercial.hada_interacciones where id = $1`,
      [fila],
    );
    if (f.estado !== 'RESERVADA' || f.c !== 0.002 || f.es_demo)
      throw new Error(JSON.stringify(f));
  },
);
await comoCliente('cli1@x');
await prueba('cierra con el costo real, sin texto', async () => {
  if ((await cerrar(fila)) !== true) throw new Error('no cerró');
  await db.exec('reset role');
  const f = await uno(`select * from comercial.hada_interacciones where id = $1`, [fila]);
  // (1000*0.10 + 200*0.50 + 5000*0.01) / 1e6
  if (
    f.estado !== 'CERRADA' ||
    Math.abs(Number(f.costo_usd) - 0.00025) > 1e-9 ||
    f.rechazos[0] !== 'NO_ESTA'
  )
    throw new Error(JSON.stringify(f));
});
await prueba('tarifa de Sonnet 5.5 cargada y cobrada en el cierre', async () => {
  await db.exec('reset role');
  const t = await uno(
    `select (precios -> 'claude-sonnet-5-5' ->> 'entrada')::float e,
            (precios -> 'claude-sonnet-5-5' ->> 'salida')::float s,
            precios ? 'claude-haiku-5-5' h from comercial.hada_config`,
  );
  if (t.e !== 2 || t.s !== 10 || !t.h) throw new Error(JSON.stringify(t));
  await comoCliente('cli1@x');
  const r = await reservar();
  const ok = (
    await uno(
      `select comercial.hada_cerrar($1,$2,'claude-sonnet-5-5',1000,200,5000,0,'experto:proponer_pedido','borrador',1,1,0,'{}',800,null) r`,
      [CLAVE, r.id],
    )
  ).r;
  await db.exec('reset role');
  const f = await uno(
    `select costo_usd::float c from comercial.hada_interacciones where id = $1`,
    [r.id],
  );
  // (1000*2.00 + 200*10.00 + 5000*0.10) / 1e6
  if (ok !== true || Math.abs(f.c - 0.0045) > 1e-9) throw new Error(JSON.stringify(f));
});
await comoCliente('cli1@x');
await prueba('no se cierra dos veces', async () => {
  if ((await cerrar(fila)) !== false) throw new Error('cerró otra vez');
});
await prueba(
  'cierre sin tokens (el modelo falló): queda el costo de reserva, no 0',
  async () => {
    const r = await reservar();
    await uno(
      `select comercial.hada_cerrar($1,$2,'claude-haiku-5-5',0,0,0,0,null,'ERROR',0,0,0,'{}',5,'MODELO_500')`,
      [CLAVE, r.id],
    );
    await db.exec('reset role');
    const f = await uno(
      `select costo_usd::float c from comercial.hada_interacciones where id = $1`,
      [r.id],
    );
    if (f.c !== 0.002) throw new Error(String(f.c));
    await comoCliente('cli1@x');
  },
);
await prueba('no se cierra la fila de otro', async () => {
  await comoCliente('cli2@x');
  const r = await reservar();
  await comoCliente('cli1@x');
  if ((await cerrar(r.id)) !== false) throw new Error('cerró la ajena');
});
await rechaza(
  'cerrar con clave mala',
  `select comercial.hada_cerrar('mala', '${fila}', 'm',0,0,0,0,null,null,0,0,0,null,0,null)`,
  /no autorizada/,
);
await prueba('la auditoría asienta reserva y cierre', async () => {
  await db.exec('reset role');
  const n = await uno(
    `select count(*)::int n from core.auditoria where tabla = 'hada_interacciones'`,
  );
  if (n.n < 3) throw new Error(String(n.n));
});

await prueba(
  'con filas de dos clientes, un cliente sigue sin leer las tablas',
  async () => {
    await comoCliente('cli1@x');
    const r = await reservar();
    await comoCliente('cli2@x');
    const r2 = await reservar();
    if (!r.permitido || !r2.permitido) throw new Error('no reservó');
    for (const e of ['cli1@x', 'cli2@x']) {
      await comoCliente(e);
      for (const t of ['comercial.hada_config', 'comercial.hada_interacciones']) {
        const n = await uno(`select count(*)::int n from ${t}`);
        if (n.n !== 0) throw new Error(`${e} ${t}: ${n.n}`);
      }
    }
    await db.exec('reset role');
    const n = await uno(`select count(*)::int n from comercial.hada_interacciones`);
    if (n.n < 2) throw new Error('no hay filas de dos clientes: ' + n.n);
  },
);
await prueba('privilegios de tabla y de columna de authenticated', async () => {
  await db.exec('reset role');
  const x = await uno(
    `select has_table_privilege('authenticated','comercial.hada_interacciones','INSERT') i,
            has_table_privilege('authenticated','comercial.hada_interacciones','UPDATE') u,
            has_table_privilege('authenticated','comercial.hada_interacciones','DELETE') d,
            has_column_privilege('authenticated','comercial.hada_config','clave_sha256','UPDATE') cu,
            has_column_privilege('authenticated','comercial.hada_config','clave_sha256','SELECT') cs`,
  );
  if (x.i || x.u || x.d || x.cu || x.cs) throw new Error(JSON.stringify(x));
});
for (const e of ['cli1@x', 'sis@x', 'ger@x']) {
  if (e.startsWith('cli')) await comoCliente(e);
  else await como(e);
  await rechaza(
    `${e}: no actualiza las interacciones`,
    `update comercial.hada_interacciones set costo_usd = 0`,
    /permission denied/,
  );
}
await como('sis@x');
await rechaza(
  'ni el Administrador del sistema lee el hash',
  `select clave_sha256 from comercial.hada_config`,
  /permission denied/,
);

// ---------------------------------------------------------------------------
// 10. Ráfaga: pasan 5, las otras 95 no
// ---------------------------------------------------------------------------
await limpiar();
await comoCliente('cli1@x');
await prueba('ráfaga de 100: pasan 5 y 95 dan LIMITE_MINUTO', async () => {
  let ok = 0;
  const motivos = new Set();
  for (let i = 0; i < 100; i++) {
    const r = await reservar();
    if (r.permitido) ok++;
    else motivos.add(r.motivo);
  }
  if (ok !== 5 || [...motivos].join() !== 'LIMITE_MINUTO')
    throw new Error(`${ok} ${[...motivos]}`);
  await db.exec('reset role');
  const n = await uno(`select count(*)::int n from comercial.hada_interacciones`);
  if (n.n !== 5) throw new Error(`filas ${n.n}`);
});
await limpiar();
const vieja = async (usuario, minutos, costo = 0.001, demo = false) => {
  await db.exec('reset role');
  await q(
    `insert into comercial.hada_interacciones (usuario_id, creado_en, costo_usd, es_demo, estado)
     values ($1, now() - ($2 || ' minutes')::interval, $3, $4, 'CERRADA')`,
    [usuario, String(minutos), costo, demo],
  );
};
await prueba(
  '5 interacciones de hace 2 minutos no cuentan para el límite por minuto',
  async () => {
    for (let i = 0; i < 5; i++) await vieja(idDe('cli1@x'), 2);
    await comoCliente('cli1@x');
    const r = await reservar();
    if (!r.permitido) throw new Error(JSON.stringify(r));
  },
);
await prueba('límite por día: la 4.ª del día da LIMITE_DIA', async () => {
  await limpiar();
  await config('limite_dia = 3, limite_minuto = 100');
  for (let i = 0; i < 3; i++) await vieja(idDe('cli1@x'), 2);
  await comoCliente('cli1@x');
  const r = await reservar();
  if (r.permitido || r.motivo !== 'LIMITE_DIA') throw new Error(JSON.stringify(r));
  await comoCliente('cli2@x');
  if (!(await reservar()).permitido) throw new Error('el límite es por usuario');
});

// ---------------------------------------------------------------------------
// Demo, interruptor y topes
// ---------------------------------------------------------------------------
await prueba('la demo arranca con 10 por día (D-hada-2, 20261116120000)', async () => {
  await db.exec('reset role');
  const f = await uno(`select limite_dia_demo n from comercial.hada_config`);
  if (f.n !== 10) throw new Error(JSON.stringify(f));
});
await prueba('la cuenta demo no usa Hada con limite_dia_demo = 0', async () => {
  await limpiar();
  await config('limite_dia = 40, limite_minuto = 5, limite_dia_demo = 0');
  await comoCliente('demo@x');
  const r = await reservar();
  if (r.permitido || r.motivo !== 'APAGADO') throw new Error(JSON.stringify(r));
});
await prueba('con limite_dia_demo = 2 la demo reserva 2 y la 3.ª no', async () => {
  await config('limite_dia_demo = 2');
  await comoCliente('demo@x');
  const a = await reservar();
  const b = await reservar();
  const c = await reservar();
  if (!a.permitido || !b.permitido || c.permitido || c.motivo !== 'LIMITE_DIA')
    throw new Error(JSON.stringify([a, b, c]));
  await db.exec('reset role');
  const f = await uno(
    `select bool_and(es_demo) d from comercial.hada_interacciones where usuario_id = $1`,
    [idDe('demo@x')],
  );
  if (f.d !== true) throw new Error('es_demo');
});
await prueba('interruptor apagado: APAGADO', async () => {
  await limpiar();
  await config('activo = false');
  await comoCliente('cli1@x');
  const r = await reservar();
  if (r.permitido || r.motivo !== 'APAGADO') throw new Error(JSON.stringify(r));
  await config('activo = true');
});
await prueba(
  'tope diario: una fila RESERVADA sin cerrar cuenta con la reserva',
  async () => {
    await limpiar();
    await config('tope_diario_usd = 0.01, reserva_usd = 0.006');
    await comoCliente('cli1@x');
    const a = await reservar(); // 0 + 0.006 <= 0.01
    const b = await reservar(); // 0.006 (reservada, sin cerrar) + 0.006 > 0.01
    if (!a.permitido || b.permitido || b.motivo !== 'TOPE')
      throw new Error(JSON.stringify([a, b]));
    await comoCliente('cli2@x');
    if ((await reservar()).permitido) throw new Error('el tope es de todos');
  },
);
await prueba('cerrar baja el costo y libera cupo del tope diario', async () => {
  await comoCliente('cli1@x');
  await db.exec('reset role');
  const id = (await uno(`select id from comercial.hada_interacciones limit 1`)).id;
  await comoCliente('cli1@x');
  await cerrar(id);
  if (!(await reservar()).permitido) throw new Error('no liberó');
});
await prueba('tope mensual: corta aunque el diario alcance', async () => {
  await limpiar();
  await config(
    'tope_diario_usd = 100, tope_mensual_usd = 1, reserva_usd = 0.002, limite_dia = 40',
  );
  // Dentro del mes y del día por la espera de la medianoche; el diario (100) no corta.
  await vieja(idDe('cli2@x'), 2, 0.999);
  await comoCliente('cli1@x');
  const r = await reservar();
  if (r.permitido || r.motivo !== 'TOPE') throw new Error(JSON.stringify(r));
});
await prueba('la clave mala no reserva y la buena sí', async () => {
  await limpiar();
  await config('tope_mensual_usd = 10, tope_diario_usd = 1');
  await comoCliente('cli1@x');
  let ok = false;
  try {
    await db.exec('savepoint m');
    await reservar('adivinada');
    ok = true;
  } catch {
    await db.exec('rollback to savepoint m');
  }
  if (ok) throw new Error('reservó con clave mala');
  if (!(await reservar()).permitido) throw new Error('la buena no reservó');
});
await prueba(
  'el Administrador del sistema lee las interacciones; no hay texto guardado',
  async () => {
    await como('sis@x');
    const n = await uno(`select count(*)::int n from comercial.hada_interacciones`);
    if (n.n < 1) throw new Error(String(n.n));
    await db.exec('reset role');
    const cols = await q(
      `select column_name from information_schema.columns where table_name = 'hada_interacciones'
        and column_name ~ 'mensaje|respuesta|texto|nombre|ip'`,
    );
    if (cols.length) throw new Error(JSON.stringify(cols));
  },
);

// ---------------------------------------------------------------------------
// Tope por usuario y escalado a Sonnet (20261113220300)
// ---------------------------------------------------------------------------
const escalar = async (id, c = CLAVE) =>
  (await uno(`select comercial.hada_escalar($1,$2) r`, [c, id])).r;
const costo = async (id) => {
  await db.exec('reset role');
  return (
    await uno(
      `select costo_usd::float c from comercial.hada_interacciones where id = $1`,
      [id],
    )
  ).c;
};
const cerrarCon = (id, modelo, entrada, salida, error = null) =>
  uno(`select comercial.hada_cerrar($1,$2,$3,$4,$5,0,0,null,'x',0,0,0,'{}',5,$6) r`, [
    CLAVE,
    id,
    modelo,
    entrada,
    salida,
    error,
  ]);
const base =
  'activo = true, tope_diario_usd = 1, tope_mensual_usd = 10, reserva_usd = 0.002, ' +
  'tope_diario_usuario_usd = 1, limite_escalados_dia = 10, reserva_experto_usd = 0.05, ' +
  'limite_minuto = 100, limite_dia = 40';

await prueba('valores por defecto de las columnas nuevas', async () => {
  await db.exec('reset role');
  const f = await uno(
    `select tope_diario_usuario_usd::float t, limite_escalados_dia l, reserva_experto_usd::float r
       from comercial.hada_config`,
  );
  if (f.t !== 0.15 || f.l !== 10 || f.r !== 0.05) throw new Error(JSON.stringify(f));
});
await prueba(
  'TOPE_USUARIO: A cierra interacciones caras y queda cortado; B sigue',
  async () => {
    await limpiar();
    await config(base);
    await config('tope_diario_usuario_usd = 0.10');
    await comoCliente('cli1@x');
    // Sonnet, 1000 de entrada y 8192 de salida = 0,08392 por interacción.
    const a = await reservar();
    await cerrarCon(a.id, 'claude-sonnet-5-5', 1000, 8192);
    const b = await reservar(); // 0,08392 + 0,002 <= 0,10
    if (!b.permitido) throw new Error(JSON.stringify(b));
    await cerrarCon(b.id, 'claude-sonnet-5-5', 1000, 8192);
    const c = await reservar();
    if (c.permitido || c.motivo !== 'TOPE_USUARIO') throw new Error(JSON.stringify(c));
    await comoCliente('cli2@x');
    const d = await reservar();
    if (!d.permitido) throw new Error('B cortado: ' + JSON.stringify(d));
  },
);
await limpiar();
await config(base);
await comoCliente('cli1@x');
await rechaza(
  'hada_escalar sin clave',
  `select comercial.hada_escalar(null, gen_random_uuid())`,
  /no autorizada/,
);
await rechaza(
  'hada_escalar con clave mala',
  `select comercial.hada_escalar('mala', gen_random_uuid())`,
  /no autorizada/,
);
await prueba(
  'hada_escalar: fila ajena, cerrada o segunda vez = NO_RESERVADA',
  async () => {
    await comoCliente('cli2@x');
    const ajena = await reservar();
    await comoCliente('cli1@x');
    const r1 = await escalar(ajena.id);
    const cerrada = await reservar();
    await cerrar(cerrada.id);
    const r2 = await escalar(cerrada.id);
    const otra = await reservar();
    const r3 = await escalar(otra.id);
    const r4 = await escalar(otra.id);
    const mal = [r1, r2, r4].filter((r) => r.permitido || r.motivo !== 'NO_RESERVADA');
    if (mal.length || !r3.permitido) throw new Error(JSON.stringify([r1, r2, r3, r4]));
    if ((await costo(ajena.id)) !== 0.002) throw new Error('tocó la ajena');
  },
);
await prueba('escalados_restantes y LIMITE_EXPERTO', async () => {
  await limpiar();
  await config(base);
  await config('limite_escalados_dia = 2');
  await comoCliente('cli1@x');
  const vistos = [];
  for (let i = 0; i < 3; i++) {
    const r = await reservar();
    vistos.push(r.escalados_restantes);
    const e = await escalar(r.id);
    if (i < 2 ? !e.permitido : e.permitido || e.motivo !== 'LIMITE_EXPERTO')
      throw new Error(`${i}: ${JSON.stringify(e)}`);
  }
  if (vistos.join() !== '2,1,0') throw new Error(vistos.join());
  await comoCliente('cli2@x');
  const r = await reservar();
  if (r.escalados_restantes !== 2 || !(await escalar(r.id)).permitido)
    throw new Error('el límite es por usuario');
});
await prueba(
  'escalar sube el costo a la reserva del experto y cuenta para el tope aunque no se cierre',
  async () => {
    await limpiar();
    await config(base);
    await config('tope_diario_usd = 0.09');
    await comoCliente('cli1@x');
    const a = await reservar();
    if (!(await escalar(a.id)).permitido) throw new Error('A no escaló');
    const ca = await costo(a.id);
    if (ca !== 0.05) throw new Error('costo ' + ca);
    await comoCliente('cli2@x');
    const b = await reservar(); // 0,05 + 0,002 <= 0,09
    if (!b.permitido) throw new Error(JSON.stringify(b));
    const eb = await escalar(b.id); // 0,052 + 0,048 > 0,09
    if (eb.permitido || eb.motivo !== 'TOPE') throw new Error(JSON.stringify(eb));
    if ((await costo(b.id)) !== 0.002) throw new Error('subió la rechazada');
    await config('tope_diario_usd = 0.053');
    await comoCliente('cli2@x');
    const c = await reservar(); // 0,052 + 0,002 > 0,053
    if (c.permitido || c.motivo !== 'TOPE') throw new Error(JSON.stringify(c));
  },
);
await prueba('escalar respeta el tope por usuario', async () => {
  await limpiar();
  await config(base);
  await config('tope_diario_usuario_usd = 0.04');
  await comoCliente('cli1@x');
  const r = await reservar();
  const e = await escalar(r.id);
  if (e.permitido || e.motivo !== 'TOPE_USUARIO') throw new Error(JSON.stringify(e));
});
await prueba(
  'cerrar un escalado con tokens 0 o con error no baja lo reservado',
  async () => {
    await limpiar();
    await config(base);
    await comoCliente('cli1@x');
    const ids3 = [];
    for (const [ent, sal, err] of [
      [0, 0, 'SONNET_500'],
      [1000, 200, 'ABORTADO'],
      [0, 0, null],
    ]) {
      await comoCliente('cli1@x');
      const r = await reservar();
      await escalar(r.id);
      await cerrarCon(r.id, 'claude-sonnet-5-5', ent, sal, err);
      ids3.push(r.id);
    }
    const cs = [];
    for (const id of ids3) cs.push(await costo(id));
    if (cs.some((c) => c !== 0.05)) throw new Error(cs.join());
  },
);
await prueba(
  'con error y un costo calculado mayor que lo reservado: cobra lo calculado',
  async () => {
    await comoCliente('cli1@x');
    const r = await reservar();
    await cerrarCon(r.id, 'claude-sonnet-5-5', 1000, 8192, 'CORTE');
    const c = await costo(r.id);
    if (Math.abs(c - 0.08392) > 1e-9) throw new Error(String(c));
  },
);
await prueba('cerrar un escalado sin error cobra lo calculado', async () => {
  await comoCliente('cli1@x');
  const r = await reservar();
  await escalar(r.id);
  await cerrarCon(r.id, 'claude-sonnet-5-5', 1000, 200);
  const c = await costo(r.id);
  // (1000*2 + 200*10) / 1e6
  if (Math.abs(c - 0.004) > 1e-9) throw new Error(String(c));
});
await prueba(
  'el cliente no lee las columnas nuevas; anon no ejecuta hada_escalar',
  async () => {
    await comoCliente('cli1@x');
    const a = await q(
      `select tope_diario_usuario_usd, limite_escalados_dia, reserva_experto_usd from comercial.hada_config`,
    );
    const b = await q(`select escalado_en from comercial.hada_interacciones`);
    if (a.length || b.length) throw new Error(`${a.length} ${b.length}`);
    await db.exec('reset role');
    const x = await uno(
      `select has_function_privilege('anon','comercial.hada_escalar(text,uuid)','EXECUTE') a,
            has_function_privilege('public','comercial.hada_escalar(text,uuid)','EXECUTE') p,
            has_column_privilege('authenticated','comercial.hada_interacciones','escalado_en','UPDATE') u`,
    );
    if (x.a || x.p || x.u) throw new Error(JSON.stringify(x));
  },
);

await invariantes();
await fin();
