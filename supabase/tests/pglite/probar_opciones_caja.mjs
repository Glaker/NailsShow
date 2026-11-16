// Opciones por caja (borrador 20261113210000, P3): una caja de aromas con su
// opción se vuelca en los renglones por SKU; el surtido lo reparte Ventas
// contra lo libre del depósito; el cliente no ve stock ni asignación.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('ven@x', 'VENTAS', 'ADMINISTRACION');
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await usuario('cli1@x', 'CLIENTE', 'ADMINISTRACION');
await usuario('cli2@x', 'CLIENTE', 'ADMINISTRACION');
const N = (x) => Number(x ?? 0);
const ids = new Map(
  (await q(`select email, id from core.usuarios`)).map((x) => [x.email, x.id]),
);
const id = (e) => ids.get(e);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const dep = async (n) =>
  (await uno(`select id from gmp.depositos where numero=$1`, [n])).id;
const [PTF, BER] = [await dep('PTF'), await dep('BER')];
const caja = async (nombre) =>
  await uno(`select * from comercial.cajas_aromas where nombre=$1`, [nombre]);
const H240 = await caja('Crema humectante 240 ml'); // 50 por caja
const ACE = await caja('Aceite de cutícula 8 ml'); // 91 por caja
const SAN1L = await caja('Sanitizante 1 L'); // 15 por caja, sin precio de lista
const EXF = await caja('Crema exfoliante 240 ml');
const [hA, hP, hE] = [H240.producto_amor_id, H240.producto_paz_id, H240.producto_aire_id];
const [xA, xP, xE] = [EXF.producto_amor_id, EXF.producto_paz_id, EXF.producto_aire_id];

// Stock de producto terminado, como superusuario.
const stock = async (d, p, c, tipo = 'ENTRADA_DEVOLUCION') => {
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por)
     values ($1,$2,$3,$4,'stock de prueba',$5)`,
    [p, d, tipo, c, id('gp@x')],
  );
  await db.exec('set session_replication_role = origin');
};

// Stock en un lote que no está liberado (RN-51): la orden no existe como liberada, así que no cuenta.
const stockLote = async (d, p, c, orden) => {
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por, orden_id)
     values ($1,$2,'ENTRADA_DEVOLUCION',$3,'lote de prueba',$4,$5)`,
    [p, d, c, id('gp@x'), orden],
  );
  await db.exec('set session_replication_role = origin');
};

await como('ven@x');
const clienteId = (
  await uno(
    `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento)
     values ('Kiosco Uno','CONSUMIDOR_FINAL','DNI','12345678') returning id`,
  )
).id;
await q(
  `insert into comercial.clientes_usuarios (usuario_id, cliente_id) values ($1,$2)`,
  [id('cli1@x'), clienteId],
);
let nPed = 0;
const pedido = async (d = PTF) =>
  (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta, descuento_pct, deposito_origen_id)
       values ($1,'Cliente caja',true,0,$2) returning id`,
      ['V-C' + ++nPed, d],
    )
  ).id;
const cajaDe = async (p, c, opcion, cajas) =>
  (
    await uno(
      `insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas) values ($1,$2,$3,$4) returning id`,
      [p, c.id, opcion, cajas],
    )
  ).id;
const ren = async (p) =>
  new Map(
    (
      await q(
        `select pr.codigo_interno c, r.cantidad, r.cantidad_caja, r.cantidad_opcion, r.descuento_caja_pct, r.precio_final, r.precio_base
           from comercial.pedido_renglones r join gmp.productos pr on pr.id = r.producto_id
          where r.pedido_id=$1 and not r.anulado`,
        [p],
      )
    ).map((x) => [x.c, x]),
  );
const reservas = async (p) =>
  new Map(
    (
      await q(
        `select pr.codigo_interno c, sum(x.cantidad - x.consumido) n from comercial.reservas_pt x
           join gmp.productos pr on pr.id = x.producto_id where x.pedido_id=$1 and not x.liberada group by 1`,
        [p],
      )
    ).map((x) => [x.c, N(x.n)]),
  );
const esperaRen = (m, esp) => {
  for (const [c, n] of Object.entries(esp))
    if (N(m.get(c)?.cantidad) !== n || N(m.get(c)?.cantidad_opcion) !== n)
      throw new Error(`${c}: ${JSON.stringify(m.get(c))} esperaba ${n}`);
  if (m.size !== Object.keys(esp).length)
    throw new Error('renglones de más: ' + [...m.keys()]);
};

// a. Las opciones dan los renglones esperados.
const pA = await pedido();
await prueba(
  'a. las 8 opciones dan los renglones esperados; el surtido sin asignar da 0',
  async () => {
    for (const [o, n] of [
      ['AMOR', 2],
      ['PAZ', 1],
      ['AIRE', 1],
      ['AMOR_PAZ', 2],
      ['AMOR_AIRE', 2],
      ['PAZ_AIRE', 2],
      ['UNA_DE_CADA', 3],
      ['SURTIDO', 4],
    ])
      await cajaDe(pA, H240, o, n);
    // amor: 100 + 25·2 + 25·2 + 50 = 250; paz: 50 + 50 + 50 + 50 = 200; aire: 50 + 50 + 50 + 50 = 200.
    esperaRen(await ren(pA), { 370: 250, 372: 200, 371: 200 });
    const pc = await uno(
      `select unidades_caja u from comercial.pedido_cajas where pedido_id=$1 and opcion='SURTIDO'`,
      [pA],
    );
    if (pc.u !== 50) throw new Error('foto de unidades: ' + pc.u);
  },
);
await prueba('a. quitar una caja baja el renglón; sin nada, lo anula', async () => {
  const p = await pedido();
  const c1 = await cajaDe(p, H240, 'AMOR_PAZ', 2);
  await q(`update comercial.pedido_cajas set cajas = 4 where id=$1`, [c1]);
  esperaRen(await ren(p), { 370: 100, 372: 100 });
  await q(`update comercial.pedido_cajas set anulado = true where id=$1`, [c1]);
  if ((await ren(p)).size !== 0) throw new Error('quedó un renglón vigente');
});

// b. UNA_DE_CADA de a tres.
for (const n of [1, 2, 4])
  await rechaza(
    `b. una de cada con ${n} cajas se rechaza`,
    `insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas) values ('${await pedido()}','${H240.id}','UNA_DE_CADA',${n})`,
    /una_de_cada_de_a_tres/,
  );
for (const n of [3, 6])
  await prueba(`b. una de cada con ${n} cajas: tres aportes iguales`, async () => {
    const p = await pedido();
    await cajaDe(p, H240, 'UNA_DE_CADA', n);
    esperaRen(await ren(p), { 370: (n / 3) * 50, 372: (n / 3) * 50, 371: (n / 3) * 50 });
  });

// c. Mixtas con unidades impares (D-opciones-caja-4): el primer aroma nombrado
// lleva la mitad hacia arriba y el segundo la mitad hacia abajo, por caja.
// Aceite: amor 381, paz 383, aire 382. Sanitizante 1 L: NS-397, NS-399, NS-398.
for (const [o, n, esp] of [
  ['AMOR_PAZ', 1, { 381: 46, 383: 45 }],
  ['AMOR_PAZ', 3, { 381: 138, 383: 135 }],
  ['AMOR_AIRE', 2, { 381: 92, 382: 90 }],
  ['PAZ_AIRE', 5, { 383: 230, 382: 225 }],
])
  await prueba(`c. mixta ${o} de 91 con ${n} cajas: 46 y 45 por caja`, async () => {
    const p = await pedido();
    await cajaDe(p, ACE, o, n);
    esperaRen(await ren(p), esp);
  });
await prueba(
  'c. mixta de 15 por caja: 8 y 7; bajar y quitar revierte exacto',
  async () => {
    const p = await pedido();
    const c1 = await cajaDe(p, SAN1L, 'AMOR_AIRE', 2);
    esperaRen(await ren(p), { 'NS-397': 16, 'NS-398': 14 });
    await q(`update comercial.pedido_cajas set cajas = 1 where id=$1`, [c1]);
    esperaRen(await ren(p), { 'NS-397': 8, 'NS-398': 7 });
    await q(`update comercial.pedido_cajas set anulado = true where id=$1`, [c1]);
    if ((await ren(p)).size !== 0) throw new Error('quedó un renglón vigente');
  },
);
await prueba('c. mixta de 50 por caja (par): sin cambios, 25 y 25', async () => {
  const p = await pedido();
  await cajaDe(p, H240, 'PAZ_AIRE', 3);
  esperaRen(await ren(p), { 372: 75, 371: 75 });
});
await prueba('c. el aceite de 91 sí va de un solo aroma', async () => {
  const p = await pedido();
  await cajaDe(p, ACE, 'AIRE', 1);
  esperaRen(await ren(p), { 382: 91 });
});

// d. Sueltas más caja del mismo SKU: un renglón, con el precio de la caja mixta.
await prueba(
  'd. sueltas + caja del mismo SKU: un renglón y el precio promedio',
  async () => {
    const p = await pedido();
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,10)`,
      [p, hA],
    );
    await cajaDe(p, H240, 'AMOR', 1);
    const m = await ren(p);
    const r = m.get('370');
    if (N(r.cantidad) !== 60 || N(r.cantidad_caja) !== 50 || N(r.cantidad_opcion) !== 50)
      throw new Error(JSON.stringify(r));
    if (
      (
        await q(
          `select 1 from comercial.pedido_renglones where pedido_id=$1 and producto_id=$2 and not anulado`,
          [p, hA],
        )
      ).length !== 1
    )
      throw new Error('más de un renglón vigente');
    const suelta = Math.round(N(r.precio_base));
    const encaja = Math.round(suelta * (1 - N(r.descuento_caja_pct) / 100));
    const esperado = Math.round(((50 * encaja + 10 * suelta) / 60) * 100) / 100;
    if (N(r.descuento_caja_pct) <= 0 || Math.abs(N(r.precio_final) - esperado) > 0.005)
      throw new Error(`${r.precio_final} vs ${esperado} (${JSON.stringify(r)})`);
  },
);
await prueba(
  'd. el renglón «todo en caja» heredado (cantidad_caja NULL) se hace explícito',
  async () => {
    const p = await pedido();
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, descuento_caja_pct) values ($1,$2,20,10)`,
      [p, hP],
    );
    await cajaDe(p, H240, 'PAZ', 1);
    const r = (await ren(p)).get('372');
    if (N(r.cantidad) !== 70 || N(r.cantidad_caja) !== 70 || N(r.cantidad_opcion) !== 50)
      throw new Error(JSON.stringify(r));
  },
);
await prueba(
  'd. Ventas no baja el renglón por debajo de lo que vino de la caja',
  async () => {
    const p = await pedido();
    await cajaDe(p, H240, 'AMOR', 1);
    await db.exec('savepoint s');
    try {
      await db.query(
        `update comercial.pedido_renglones set cantidad = 10, cantidad_caja = 10 where pedido_id=$1`,
        [p],
      );
      throw new Error('no rechazó');
    } catch (e) {
      await db.exec('rollback to savepoint s');
      if (!/cantidad_opcion_tope/.test(e.message)) throw e;
    }
  },
);
await prueba(
  'd. Ventas no anula a mano un renglón que viene de una caja (el CHECK da el error crudo)',
  async () => {
    const p = await pedido();
    await cajaDe(p, H240, 'AMOR', 1);
    await db.exec('savepoint s');
    try {
      await db.query(
        `update comercial.pedido_renglones set anulado = true where pedido_id=$1`,
        [p],
      );
      throw new Error('no rechazó');
    } catch (e) {
      await db.exec('rollback to savepoint s');
      if (!/renglones_anulado_sin_opcion/.test(e.message)) throw e;
    }
    // Un renglón suelto sí se anula.
    const q2 = await pedido();
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,5)`,
      [q2, hE],
    );
    await q(`update comercial.pedido_renglones set anulado = true where pedido_id=$1`, [
      q2,
    ]);
  },
);
await prueba(
  'd. sin descuento de caja en un renglón de caja: cambiar cajas y asignar surtido no fallan',
  async () => {
    const p = await pedido();
    const c = await cajaDe(p, H240, 'AMOR', 2);
    await q(
      `update comercial.pedido_renglones set cantidad_caja = null, descuento_caja_pct = null where pedido_id=$1`,
      [p],
    );
    await q(`update comercial.pedido_cajas set cajas = 3 where id=$1`, [c]);
    let r = (await ren(p)).get('370');
    if (
      N(r.cantidad) !== 150 ||
      N(r.cantidad_opcion) !== 150 ||
      N(r.cantidad_caja) !== 150
    )
      throw new Error(JSON.stringify(r));
    if (N(r.descuento_caja_pct) <= 0) throw new Error('no volvió el % por defecto');
    await q(`update comercial.pedido_cajas set cajas = 1 where id=$1`, [c]);
    r = (await ren(p)).get('370');
    if (N(r.cantidad) !== 50 || N(r.cantidad_caja) !== 50)
      throw new Error(JSON.stringify(r));
  },
);

// e. Asignación.
await stock(PTF, hA, 200); // 4 cajas
await stock(PTF, hP, 100); // 2 cajas
await como('ven@x');
const p1 = await pedido();
const s1 = await cajaDe(p1, H240, 'SURTIDO', 4);
const asigna = (pc, a, p, e) =>
  q(`select comercial.asignar_surtido($1,$2,$3,$4)`, [pc, a, p, e]);
await prueba('e. surtido_disponible: amor 4, paz 2, aire 0', async () => {
  const r = await uno(`select * from comercial.surtido_disponible($1)`, [s1]);
  if (r.amor !== 4 || r.paz !== 2 || r.aire !== 0) throw new Error(JSON.stringify(r));
});
await rechaza(
  'e. se rechaza si la suma no da las cajas pedidas',
  `select comercial.asignar_surtido('${s1}',1,1,1)`,
  /son 4 cajas/,
);
await rechaza(
  'e. se rechaza si se asigna de más de un aroma',
  `select comercial.asignar_surtido('${s1}',0,3,1)`,
  /Paz/,
);
await rechaza(
  'e. se rechaza un aroma sin existencias',
  `select comercial.asignar_surtido('${s1}',0,0,4)`,
  /Aire/,
);
await prueba('e. asigna 4/0/0: renglón y reserva', async () => {
  await asigna(s1, 4, 0, 0);
  esperaRen(await ren(p1), { 370: 200 });
  const r = await reservas(p1);
  if (r.size !== 1 || r.get('370') !== 200) throw new Error(JSON.stringify([...r]));
  const a = await uno(
    `select asignado_amor a, asignado_por p, asignado_en e from comercial.pedido_cajas where id=$1`,
    [s1],
  );
  if (a.a !== 4 || !a.p || !a.e) throw new Error(JSON.stringify(a));
});
await prueba(
  'e. las reservas de otros pedidos se descuentan: un segundo pedido ve menos',
  async () => {
    const p2 = await pedido();
    const s2 = await cajaDe(p2, H240, 'SURTIDO', 2);
    const r = await uno(`select * from comercial.surtido_disponible($1)`, [s2]);
    if (r.amor !== 0 || r.paz !== 2 || r.aire !== 0) throw new Error(JSON.stringify(r));
    await rechaza(
      'e. el segundo no puede tomar amor',
      `select comercial.asignar_surtido('${s2}',1,1,0)`,
      /Amor/,
    );
  },
);
await prueba('e. reasignar libera y vuelve a reservar', async () => {
  await asigna(s1, 2, 2, 0);
  esperaRen(await ren(p1), { 370: 100, 372: 100 });
  const r = await reservas(p1);
  if (r.size !== 2 || r.get('370') !== 100 || r.get('372') !== 100)
    throw new Error(JSON.stringify([...r]));
  const lib = await uno(
    `select count(*)::int n from comercial.reservas_pt where pedido_id=$1 and liberada and cantidad = 200`,
    [p1],
  );
  if (lib.n !== 1) throw new Error('no liberó la reserva anterior');
});
await prueba(
  'e. Berna en negativo cuenta 0 y no les resta a los otros aromas',
  async () => {
    await stock(BER, xA, 100);
    await stock(BER, xE, -30, 'SALIDA_VENTA');
    await como('ven@x');
    const p = await pedido(BER);
    const s = await cajaDe(p, EXF, 'SURTIDO', 2);
    const r = await uno(`select * from comercial.surtido_disponible($1)`, [s]);
    if (r.amor !== 2 || r.paz !== 0 || r.aire !== 0) throw new Error(JSON.stringify(r));
  },
);
await prueba('e. lo retenido o ya pedido como suelto no se puede asignar', async () => {
  const p = await pedido();
  await q(
    `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,60)`,
    [p, hP],
  );
  const s = await cajaDe(p, H240, 'SURTIDO', 1);
  // paz libre: 100 - 100 reservados por p1 = 0.
  const r = await uno(`select * from comercial.surtido_disponible($1)`, [s]);
  if (r.paz !== 0) throw new Error(JSON.stringify(r));
});

await prueba(
  'e. el stock de un lote retenido o bloqueado no se asigna (RN-51/52)',
  async () => {
    await db.exec('reset role');
    await db.exec('set session_replication_role = replica');
    const o = await uno(
      `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, numero, numero_lote, vencimiento, vencimiento_texto)
       values (gen_random_uuid(), $1, current_date, 99, 1, 'OP-RET-1', 'L-RET-1', current_date + 365, 'x') returning id, estado`,
      [xP],
    );
    await db.exec('set session_replication_role = origin');
    if (o.estado === 'LIBERADA') throw new Error('la orden de prueba ya está liberada');
    await stock(PTF, xP, 50); // 1 caja sin lote
    await stockLote(PTF, xP, 100, o.id); // 2 cajas en un lote no liberado
    await como('ven@x');
    const p = await pedido();
    const s = await cajaDe(p, EXF, 'SURTIDO', 2);
    const r = await uno(`select * from comercial.surtido_disponible($1)`, [s]);
    if (r.paz !== 1) throw new Error('contó el lote no liberado: ' + JSON.stringify(r));
    await rechaza(
      'e. no se asigna lo retenido',
      `select comercial.asignar_surtido('${s}',0,2,0)`,
      /Paz/,
    );
  },
);
await prueba(
  'e. Ventas no escribe el reparto ni el autor por fuera de asignar_surtido',
  async () => {
    await como('ven@x');
    const s = await cajaDe(await pedido(), H240, 'SURTIDO', 1);
    await rechaza(
      'e. UPDATE directo del reparto',
      `update comercial.pedido_cajas set asignado_amor=1, asignado_paz=0, asignado_aire=0 where id='${s}'`,
      /Asignar surtido/,
    );
    await rechaza(
      'e. INSERT con el reparto ya escrito',
      `insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas, asignado_amor, asignado_paz, asignado_aire, asignado_en)
     values ('${await pedido()}','${H240.id}','SURTIDO',1,1,0,0,now())`,
      /Asignar surtido/,
    );
    await rechaza(
      'e. falsificar el autor de una asignación',
      `update comercial.pedido_cajas set asignado_por=null where id='${s1}'`,
      /Asignar surtido/,
    );
    const a = await uno(`select asignado_por p from comercial.pedido_cajas where id=$1`, [
      s1,
    ]);
    if (a.p !== id('ven@x')) throw new Error('el autor no es Ventas: ' + a.p);
  },
);
await rechaza(
  'e. los productos de un grupo de aromas no se cambian',
  `update comercial.cajas_aromas set producto_amor_id='${hP}', producto_paz_id='${hA}' where id='${H240.id}'`,
  /no se cambian/,
);
await prueba('e. el nombre y activo de un grupo sí se cambian', async () => {
  await q(`update comercial.cajas_aromas set nombre = nombre || ' ' where id=$1`, [
    SAN1L.id,
  ]);
  await q(`update comercial.cajas_aromas set nombre = btrim(nombre) where id=$1`, [
    SAN1L.id,
  ]);
});

await prueba(
  'e. asignar un surtido funciona aunque Ventas haya quitado el descuento de caja del renglón',
  async () => {
    await como('ven@x');
    const p = await pedido(BER);
    const s = await cajaDe(p, EXF, 'SURTIDO', 1);
    const u = (
      await uno(`select unidades_caja u from comercial.pedido_cajas where id=$1`, [s])
    ).u;
    await q(`select comercial.asignar_surtido($1,1,0,0)`, [s]);
    await q(
      `update comercial.pedido_renglones set cantidad_caja = null, descuento_caja_pct = null where pedido_id=$1`,
      [p],
    );
    await q(`select comercial.asignar_surtido($1,1,0,0)`, [s]);
    const r = (await ren(p)).get('364');
    if (N(r.cantidad) !== u || N(r.cantidad_opcion) !== u || N(r.cantidad_caja) !== u)
      throw new Error(JSON.stringify(r));
  },
);

// f. Quién puede asignar.
const sinPermiso = async (n, sql) =>
  prueba(n, async () => {
    await db.exec('savepoint s');
    try {
      await db.query(sql);
      throw new Error('no rechazó');
    } catch (e) {
      await db.exec('rollback to savepoint s');
      if (e.code !== '42501') throw new Error(`${e.code}: ${e.message}`);
    }
  });
const comoCliente = async (email) => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ usuario_id: id(email), rol: null, roles: [], es_cliente: true }),
  ]);
  await db.exec('set role authenticated');
};
for (const [quien, ent] of [
  ['el cliente', () => comoCliente('cli1@x')],
  ['Gerencia de Producción', () => como('gp@x')],
  [
    'anon',
    async () => {
      await db.exec('reset role');
      await db.exec('set role anon');
    },
  ],
]) {
  await ent();
  await sinPermiso(
    `f. ${quien} no asigna`,
    `select comercial.asignar_surtido('${s1}',2,2,0)`,
  );
  await sinPermiso(
    `f. ${quien} no llama a surtido_libre_unidades`,
    `select comercial.surtido_libre_unidades('${p1}','${hA}')`,
  );
  await sinPermiso(
    `f. ${quien} no consulta el surtido`,
    `select * from comercial.surtido_disponible('${s1}')`,
  );
}

// g. Estados.
await como('ven@x');
await prueba(
  'g. un surtido sin asignar no sale de BORRADOR, salvo para cancelar',
  async () => {
    const p = await pedido();
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,5)`,
      [p, hE],
    );
    await cajaDe(p, H240, 'SURTIDO', 1);
    await rechaza(
      'g. a ESPERANDO_FECHA',
      `update comercial.pedidos set estado='ESPERANDO_FECHA' where id='${p}'`,
      /sin repartir/,
    );
    await rechaza(
      'g. a CONFIRMADO',
      `update comercial.pedidos set estado='CONFIRMADO' where id='${p}'`,
      /sin repartir/,
    );
    await q(`update comercial.pedidos set estado='CANCELADO' where id='${p}'`);
  },
);
await prueba(
  'g. asignado, pasa a ESPERANDO_FECHA y las cajas ya no se editan',
  async () => {
    await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [p1]);
    await rechaza(
      'g. cambiar cajas',
      `update comercial.pedido_cajas set cajas = 6 where id='${s1}'`,
      /en borrador/,
    );
    await rechaza(
      'g. cargar otra caja',
      `insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas) values ('${p1}','${H240.id}','AMOR',1)`,
      /en borrador/,
    );
    await rechaza(
      'g. reasignar',
      `select comercial.asignar_surtido('${s1}',2,2,0)`,
      /en borrador/,
    );
    await q(`update comercial.pedidos set estado='BORRADOR' where id=$1`, [p1]);
    await asigna(s1, 2, 2, 0);
  },
);

// Cliente: pedido con cajas.
await stock(BER, hA, 150);
await stock(BER, hP, 150);
await stock(BER, hE, 150);
const mias = (email) => async () => {
  await comoCliente(email);
};
await comoCliente('cli1@x');
const cajasCli = () => q(`select * from comercial.cliente_cajas()`);
await prueba(
  'cliente_cajas ofrece los grupos con precio de lista y marca las mixtas',
  async () => {
    const r = await cajasCli();
    const h = r.find((x) => x.caja_id === H240.id);
    if (!h || h.unidades_caja !== 50 || !h.mixta || N(h.precio_promo) <= 0)
      throw new Error(JSON.stringify(r));
    const a = r.find((x) => x.caja_id === ACE.id);
    // D-opciones-caja-4: toda caja admite mixtas, también las de unidades impares.
    if (!a || !a.mixta || a.unidades_caja !== 91)
      throw new Error('aceite: ' + JSON.stringify(a));
    if (r.some((x) => x.caja_id === SAN1L.id))
      throw new Error('ofrece el sanitizante de 1 L sin precio');
  },
);
let pc;
await prueba('el cliente envía cajas y sueltas', async () => {
  pc = (
    await uno(
      `select comercial.cliente_enviar_pedido(null, $1::jsonb, 'x', $2::jsonb) id`,
      [
        JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
        JSON.stringify([
          { caja_id: H240.id, opcion: 'SURTIDO', cajas: 4 },
          { caja_id: H240.id, opcion: 'UNA_DE_CADA', cajas: 3 },
        ]),
      ],
    )
  ).id;
  const r = (await q(`select * from comercial.cliente_pedidos()`))[0];
  if (
    r.renglones.length !== 1 ||
    N(r.renglones[0].cantidad) !== 7 ||
    r.cajas.length !== 2
  )
    throw new Error(JSON.stringify(r));
});
for (const [n, cajas, pat] of [
  [
    'una de cada con 2',
    [{ caja_id: H240.id, opcion: 'UNA_DE_CADA', cajas: 2 }],
    /de a 3/,
  ],
  [
    'caja fuera de lista',
    [{ caja_id: SAN1L.id, opcion: 'AMOR', cajas: 1 }],
    /ya no están en la lista/,
  ],
  [
    'opción inventada',
    [{ caja_id: H240.id, opcion: 'TODAS', cajas: 1 }],
    /opción y una cantidad/,
  ],
  [
    'caja repetida',
    [
      { caja_id: H240.id, opcion: 'AMOR', cajas: 1 },
      { caja_id: H240.id, opcion: 'AMOR', cajas: 2 },
    ],
    /repetida/,
  ],
])
  await rechaza(
    `el cliente: ${n} se rechaza sin hablar de stock`,
    `select comercial.cliente_enviar_pedido(null, '[]'::jsonb, null, '${JSON.stringify(cajas)}'::jsonb)`,
    pat,
  );
await rechaza(
  'el cliente: un pedido vacío se rechaza',
  `select comercial.cliente_enviar_pedido(null, '[]'::jsonb, null, '[]'::jsonb)`,
  /no tiene productos/,
);

// h. El cliente recibe lo mismo antes y después de asignar.
const clavesOk = (o, claves) => {
  const k = Object.keys(o).sort().join();
  if (k !== [...claves].sort().join()) throw new Error('claves: ' + k);
};
let antes;
await prueba('h. cliente_pedidos: claves en lista blanca', async () => {
  const r = (await q(`select * from comercial.cliente_pedidos()`))[0];
  antes = JSON.stringify(r);
  clavesOk(r, [
    'id',
    'numero',
    'estado',
    'estado_cliente',
    'enviado_en',
    'fecha_entrega',
    'editable',
    'cancelado',
    'observaciones',
    'renglones',
    'cajas',
  ]);
  for (const x of r.renglones)
    clavesOk(x, ['producto_id', 'cantidad', 'producto', 'codigo']);
  for (const x of r.cajas) clavesOk(x, ['caja_id', 'nombre', 'opcion', 'cajas']);
});
const cajasStockCero = JSON.stringify(await cajasCli());
await como('ven@x');
await prueba('h. Ventas asigna el surtido del cliente (BER)', async () => {
  const s = await uno(
    `select id from comercial.pedido_cajas where pedido_id=$1 and opcion='SURTIDO'`,
    [pc],
  );
  await asigna(s.id, 1, 1, 2);
  const m = await ren(pc);
  // sueltas 7 de paz + una de cada (50 c/u) + surtido 50/50/100.
  if (
    N(m.get('370').cantidad) !== 100 ||
    N(m.get('372').cantidad) !== 107 ||
    N(m.get('371').cantidad) !== 150
  )
    throw new Error(JSON.stringify([...m]));
});
await comoCliente('cli1@x');
await prueba('h. cliente_pedidos es idéntico antes y después de asignar', async () => {
  const despues = JSON.stringify(
    (await q(`select * from comercial.cliente_pedidos()`))[0],
  );
  if (despues !== antes) throw new Error(antes + '\n' + despues);
});
await prueba('h. cliente_cajas no cambia con stock 0, positivo ni negativo', async () => {
  const pos = JSON.stringify(await cajasCli());
  await stock(BER, hA, -1000, 'SALIDA_VENTA'); // saldo negativo
  await comoCliente('cli1@x');
  const neg = JSON.stringify(await cajasCli());
  await stock(BER, hA, 2000);
  await comoCliente('cli1@x');
  const pos2 = JSON.stringify(await cajasCli());
  if (pos !== neg || pos !== pos2 || pos !== cajasStockCero)
    throw new Error('cambió con el stock');
});

// i. Sin lectura de nada interno.
await prueba('i. el cliente ve 0 filas de stock, reservas y cajas', async () => {
  for (const t of [
    'comercial.movimientos_pt',
    'comercial.reservas_pt',
    'comercial.v_disponible_pt',
    'comercial.v_pendientes_despacho',
    'comercial.pedido_cajas',
    'comercial.cajas_aromas',
    'comercial.pedido_renglones',
  ]) {
    const r = await uno(`select count(*)::int n from ${t}`);
    if (r.n !== 0) throw new Error(`${t}: ${r.n}`);
  }
});

// k. Reenvío tras la asignación.
await prueba('k. reenviar lo mismo conserva la asignación', async () => {
  await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, 'x', $3::jsonb)`, [
    pc,
    JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
    JSON.stringify([
      { caja_id: H240.id, opcion: 'SURTIDO', cajas: 4 },
      { caja_id: H240.id, opcion: 'UNA_DE_CADA', cajas: 3 },
    ]),
  ]);
  await db.exec('reset role');
  const r = await uno(
    `select asignado_en e from comercial.pedido_cajas where pedido_id=$1 and opcion='SURTIDO'`,
    [pc],
  );
  if (!r.e) throw new Error('perdió la asignación');
});
await prueba(
  'k. un frente viejo (3 argumentos) no borra las cajas; [] las saca todas',
  async () => {
    await comoCliente('cli1@x');
    const n = async () =>
      (await q(`select * from comercial.cliente_pedidos()`)).find((x) => x.id === pc)
        .cajas.length;
    const antes = await n();
    await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, 'x')`, [
      pc,
      JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
    ]);
    if ((await n()) !== antes || antes !== 2)
      throw new Error('3 argumentos tocó las cajas: ' + (await n()));
    await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, 'x', null)`, [
      pc,
      JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
    ]);
    if ((await n()) !== 2) throw new Error('null tocó las cajas');
    await db.exec('savepoint v');
    await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, 'x', '[]'::jsonb)`, [
      pc,
      JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
    ]);
    if ((await n()) !== 0) throw new Error('[] no sacó las cajas');
    await db.exec('rollback to savepoint v');
    if ((await n()) !== 2) throw new Error('el savepoint no restauró');
  },
);
await comoCliente('cli1@x');
await prueba(
  'k. al cambiar el surtido la asignación vuelve a pendiente y se liberan las reservas',
  async () => {
    const antes = (await q(`select * from comercial.cliente_pedidos()`))[0];
    await q(`select comercial.cliente_enviar_pedido($1, $2::jsonb, 'x', $3::jsonb)`, [
      pc,
      JSON.stringify([{ producto_id: hP, cantidad: 7 }]),
      JSON.stringify([
        { caja_id: H240.id, opcion: 'SURTIDO', cajas: 2 },
        { caja_id: H240.id, opcion: 'UNA_DE_CADA', cajas: 3 },
      ]),
    ]);
    await db.exec('reset role');
    const r = await uno(
      `select asignado_en e, asignado_amor a, cajas from comercial.pedido_cajas where pedido_id=$1 and opcion='SURTIDO' and not anulado`,
      [pc],
    );
    if (r.e || r.a !== null || r.cajas !== 2) throw new Error(JSON.stringify(r));
    const m = await ren(pc);
    // sueltas 7 de paz + una de cada (50 c/u); el surtido vuelve a 0.
    if (
      N(m.get('370').cantidad) !== 50 ||
      N(m.get('372').cantidad) !== 57 ||
      N(m.get('371').cantidad) !== 50
    )
      throw new Error(JSON.stringify([...m]));
    const rs = await reservas(pc);
    if (rs.size !== 0) throw new Error('quedaron reservas: ' + JSON.stringify([...rs]));
    void antes;
  },
);

// j. Barrido del catálogo.
await db.exec('reset role');
await prueba('j. ninguna política using (true) en las tablas nuevas', async () => {
  const r = await q(
    `select tablename, policyname from pg_policies
      where schemaname='comercial' and tablename in ('cajas_aromas','pedido_cajas') and (qual='true' or with_check='true')`,
  );
  if (r.length) throw new Error(JSON.stringify(r));
});
await prueba('j. toda vista de comercial es security_invoker', async () => {
  const r = await q(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='comercial' and c.relkind='v'
        and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)`,
  );
  if (r.length) throw new Error(JSON.stringify(r));
});
const clienteLeeStock = () =>
  q(String.raw`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='comercial' and proname like 'cliente\_%'
        and (prosrc ~* '(from|join)\s+comercial\.(v_disponible_pt|reservas_pt|movimientos_pt|v_pendientes_despacho|v_calle5)'
          or prosrc ~* 'raise exception ''[^'']*(stock|disponib)')`);
await prueba(
  'j. ninguna función cliente_* lee stock ni lo nombra en sus errores',
  async () => {
    const r = await clienteLeeStock();
    if (r.length) throw new Error(JSON.stringify(r));
    // El detector tiene que detectar: una función de prueba que lee reservas_pt y otra que nombra el stock.
    await db.exec('savepoint det');
    await db.exec(`create function comercial.cliente_x() returns bigint language sql as
      'select count(*) from comercial.reservas_pt'`);
    await db.exec(`create function comercial.cliente_y() returns void language plpgsql as
      'begin raise exception ''Sin stock de eso''; end'`);
    const pos = (await clienteLeeStock())
      .map((x) => x.proname)
      .sort()
      .join();
    await db.exec('rollback to savepoint det');
    if (pos !== 'cliente_x,cliente_y') throw new Error('el detector no detecta: ' + pos);
  },
);
// k. El cliente envía una mixta del aceite (91 por caja): 46 Amor y 45 Paz por caja (D-opciones-caja-4).
await prueba(
  'k. el cliente envía una mixta impar y se vuelca 46/45 por caja',
  async () => {
    await comoCliente('cli1@x');
    const p = (
      await uno(
        `select comercial.cliente_enviar_pedido(null, '[]'::jsonb, null, $1::jsonb) id`,
        [JSON.stringify([{ caja_id: ACE.id, opcion: 'AMOR_PAZ', cajas: 2 }])],
      )
    ).id;
    await como('ven@x');
    esperaRen(await ren(p), { 381: 92, 383: 90 });
  },
);
await prueba('j. las tablas nuevas tienen RLS forzada y auditoría', async () => {
  const r = await q(
    `select c.relname, c.relforcerowsecurity f,
            exists (select 1 from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal and t.tgname like '%audit%') a
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='comercial' and c.relname in ('cajas_aromas','pedido_cajas')`,
  );
  if (r.length !== 2 || r.some((x) => !x.f || !x.a)) throw new Error(JSON.stringify(r));
});

await invariantes();
fin();
