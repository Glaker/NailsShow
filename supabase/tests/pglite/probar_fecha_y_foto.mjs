// Circuito nuevo del pedido de venta (20261019130000 y 20261019130100): la
// fecha la propone Gerencia de Producción, Ventas aprueba, se congela la foto
// del importe y recién ahí el pedido cuenta en las estadísticas.
//
// La suite corre en una transacción (lib.mjs). Los controles «en la misma
// transacción» (= now()) se prueban cortándola con otraTransaccion(), que es
// lo que pasa en la API: cada pedido HTTP es su propia transacción.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const dia = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const pack = await prod('80PACK'),
  mono = await prod('101'),
  otro = await prod('102');
const estado = async (p) =>
  (await uno(`select estado from comercial.pedidos where id=$1`, [p])).estado;
const otraTransaccion = async (quien) => {
  await db.exec('reset role; commit; begin');
  await como(quien);
};
const proponer = (p, fecha, demorados = []) =>
  uno(`select comercial.proponer_fecha($1, $2::date, null, $3::jsonb) id`, [
    p,
    fecha,
    JSON.stringify(demorados.map(([renglon_id, f]) => ({ renglon_id, fecha: f }))),
  ]);
const enDias = async (n) =>
  (
    await uno(
      `select ((now() at time zone 'America/Argentina/Buenos_Aires')::date + $1::int)::text d`,
      [n],
    )
  ).d;
const F20 = await enDias(20),
  F25 = await enDias(25),
  F30 = await enDias(30),
  F35 = await enDias(35);

await como('mati@x');
const cli = (
  await uno(
    `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Cliente mayorista','CONSUMIDOR_FINAL','DNI','30999888') returning id`,
  )
).id;
// El cliente hizo el pedido el 1/10.
const p = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, cliente_id, es_venta, fecha) values ('V-1','Cliente mayorista',$1,true, date '2026-10-01') returning id`,
    [cli],
  )
).id;
const nuevoRenglon = async (pedido, producto, cant) =>
  (
    await uno(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3) returning id`,
      [pedido, producto, cant],
    )
  ).id;
const rPack = await nuevoRenglon(p, pack, 5);
const rMono = await nuevoRenglon(p, mono, 70);

// --- Antes de pedir fecha -------------------------------------------------
await rechaza(
  'Ventas no aprueba un pedido sin fecha propuesta',
  `select comercial.enviar_venta($1)`,
  /no tiene fecha propuesta/,
  [p],
);
await rechaza(
  'ni lo confirma a mano salteando la fecha',
  `update comercial.pedidos set estado='CONFIRMADO' where id=$1`,
  /fecha que propuso/,
  [p],
);
await rechaza(
  'ni lo confirma haciéndolo pasar por pedido de producción',
  `update comercial.pedidos set es_venta=false, estado='CONFIRMADO' where id=$1`,
  /no cambia de venta/,
  [p],
);
// Revisión del 2026-10-19: en dos pasos también (antes, en borrador, el
// primero pasaba y el segundo ya no exigía fecha ni foto).
await rechaza(
  'ni en dos pasos: primero deja de ser de venta',
  `update comercial.pedidos set es_venta=false where id=$1`,
  /no cambia de venta/,
  [p],
);
await prueba(
  'un pedido de producción no espera fecha, y sigue confirmándose como siempre',
  async () => {
    await db.exec('savepoint np');
    const s = (
      await uno(
        `insert into comercial.pedidos (numero, cliente) values ('S-9','Stock') returning id`,
      )
    ).id;
    await nuevoRenglon(s, mono, 1);
    let msg = '';
    try {
      await db.exec('savepoint np2');
      await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [s]);
    } catch (e) {
      msg = e.message;
      await db.exec('rollback to savepoint np2');
    }
    await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [s]);
    const e = await estado(s);
    // Y su factura no la frena el control de pedidos sin aprobar (falla después,
    // por los datos que faltan, no por el estado).
    let fac = '';
    try {
      await db.exec('savepoint np3');
      await q(`insert into comercial.facturas (pedido_id) values ($1)`, [s]);
    } catch (err) {
      fac = err.message;
      await db.exec('rollback to savepoint np3');
    }
    await db.exec('rollback to savepoint np');
    if (
      !/Solo un pedido de venta/.test(msg) ||
      e !== 'CONFIRMADO' ||
      /todavía no se aprobó/.test(fac)
    )
      throw new Error([msg, e, fac].join(' / '));
  },
);
await rechaza(
  'ni se lo hace pasar por pedido de producción para que espere fecha',
  `update comercial.pedidos set es_venta=false, estado='ESPERANDO_FECHA' where id=$1`,
  /no cambia de venta/,
  [p],
);

await prueba('Ventas pide fecha: queda esperando a Gerencia de Producción', async () => {
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [p]);
  if ((await estado(p)) !== 'ESPERANDO_FECHA') throw new Error(await estado(p));
});
await rechaza(
  'con la fecha pedida ya no cambia de venta a producción',
  `update comercial.pedidos set es_venta=false where id=$1`,
  /no cambia de venta/,
  [p],
);
await rechaza(
  'Ventas no se propone la fecha',
  `select comercial.proponer_fecha($1, current_date + 20)`,
  /row-level security|política|policy/i,
  [p],
);
await rechaza(
  'ni pasa el pedido a «fecha propuesta» sin propuesta',
  `update comercial.pedidos set estado='FECHA_PROPUESTA' where id=$1`,
  /propone Gerencia de Producción/,
  [p],
);
// preparar_factura ya lo frena antes (no salió nada); el control de la tabla
// cubre cualquier otro camino que inserte una factura.
await rechaza(
  'ni se le inserta una factura antes de aprobarlo',
  `insert into comercial.facturas (pedido_id) values ($1)`,
  // Desde 20261016120000 el rol ya no inserta facturas: las escriben solo las
  // funciones. El trigger del pedido sin aprobar queda como segunda barrera.
  /todavía no se aprobó|permission denied/,
  [p],
);
await prueba('una nota de crédito no la frena el estado del pedido (RN-56)', async () => {
  let msg = '';
  try {
    await db.exec('savepoint nc');
    await q(
      `insert into comercial.facturas (pedido_id, comprobante) values ($1, 'NOTA_CREDITO')`,
      [p],
    );
  } catch (e) {
    msg = e.message;
    await db.exec('rollback to savepoint nc');
  }
  // Puede fallar por los datos que faltan, nunca por «sin aprobar».
  if (/todavía no se aprobó/.test(msg)) throw new Error(msg);
});

// --- Gerencia de Producción propone ---------------------------------------
await como('naza@x');
await rechaza(
  'la fecha del pedido entero no es anterior a la de un producto demorado',
  `select comercial.proponer_fecha($1, $2::date, null, $3::jsonb)`,
  /no puede ser anterior/,
  [p, F20, JSON.stringify([{ renglon_id: rMono, fecha: F25 }])],
);
await rechaza(
  'ni anterior a hoy',
  `select comercial.proponer_fecha($1, $2::date)`,
  /anterior a hoy/,
  [p, await enDias(-1)],
);
await rechaza(
  'ni un producto demorado con fecha anterior a hoy',
  `select comercial.proponer_fecha($1, $2::date, null, $3::jsonb)`,
  /demorado no puede ser anterior a hoy/,
  [p, F25, JSON.stringify([{ renglon_id: rMono, fecha: await enDias(-1) }])],
);
await prueba(
  'Naza propone para el pedido y una fecha anterior para el monómero',
  async () => {
    await proponer(p, F25, [[rMono, F20]]);
    if ((await estado(p)) !== 'FECHA_PROPUESTA') throw new Error(await estado(p));
    const d = await uno(
      `select count(*)::int n from comercial.propuestas_fecha_renglones pr
       join comercial.propuestas_fecha f on f.id = pr.propuesta_id where f.pedido_id=$1`,
      [p],
    );
    if (d.n !== 1) throw new Error(String(d.n));
  },
);
await rechaza(
  'no se propone dos veces sin que Ventas la pida de nuevo',
  `select comercial.proponer_fecha($1, current_date + 40)`,
  /la está esperando/,
  [p],
);
await otraTransaccion('naza@x');
await rechaza(
  'en otra transacción ya no se le suman productos demorados',
  `insert into comercial.propuestas_fecha_renglones (propuesta_id, renglon_id, fecha)
   select id, $2, current_date + 1 from comercial.propuestas_fecha where pedido_id=$1`,
  /junto con su propuesta/,
  [p, rPack],
);

// --- «A reconfirmar» -------------------------------------------------------
await como('mati@x');
await prueba(
  'cambiar el descuento o un precio no la devuelve a Gerencia de Producción',
  async () => {
    await q(`update comercial.pedidos set descuento_pct=30 where id=$1`, [p]);
    await q(
      `update comercial.pedido_renglones set precio_manual=true, precio_final=6000 where id=$1`,
      [rMono],
    );
    await q(`update comercial.pedido_renglones set precio_manual=false where id=$1`, [
      rMono,
    ]);
    if ((await estado(p)) !== 'FECHA_PROPUESTA') throw new Error(await estado(p));
  },
);
const vuelve = async (accion) => {
  await db.exec('savepoint v');
  await accion();
  const e = await estado(p);
  await db.exec('rollback to savepoint v');
  if (e !== 'ESPERANDO_FECHA') throw new Error(e);
};
await prueba('agregar un producto la devuelve', () =>
  vuelve(() => nuevoRenglon(p, otro, 3)),
);
await prueba('cambiar el producto la devuelve', () =>
  vuelve(() =>
    q(`update comercial.pedido_renglones set producto_id=$2 where id=$1`, [rPack, otro]),
  ),
);
await prueba('quitar un producto la devuelve', () =>
  vuelve(() =>
    q(`update comercial.pedido_renglones set anulado=true where id=$1`, [rPack]),
  ),
);
await prueba(
  'quitar todos los productos no la devuelve, y así no se aprueba',
  async () => {
    await db.exec('savepoint todos');
    await q(`update comercial.pedido_renglones set anulado=true where pedido_id=$1`, [p]);
    const e = await estado(p);
    let msg = '';
    try {
      await db.exec('savepoint todos2');
      await q(`select comercial.enviar_venta($1)`, [p]);
    } catch (err) {
      msg = err.message;
      await db.exec('rollback to savepoint todos2');
    }
    await db.exec('rollback to savepoint todos');
    if (e !== 'FECHA_PROPUESTA' || !/no tiene productos/.test(msg))
      throw new Error(e + ' / ' + msg);
  },
);
await prueba('cambiar una cantidad la devuelve: queda «a reconfirmar»', async () => {
  await q(`update comercial.pedido_renglones set cantidad=80 where id=$1`, [rMono]);
  if ((await estado(p)) !== 'ESPERANDO_FECHA') throw new Error(await estado(p));
});
await prueba('y mientras tanto no cuenta en las estadísticas', async () => {
  const n = await uno(
    `select count(*)::int n from comercial.v_ventas_pedidas where pedido_id=$1`,
    [p],
  );
  if (n.n !== 0) throw new Error(String(n.n));
});

await otraTransaccion('naza@x');
await prueba('Naza vuelve a proponer', async () => {
  await proponer(p, F30);
  if ((await estado(p)) !== 'FECHA_PROPUESTA') throw new Error(await estado(p));
});

// --- La foto no se falsifica ----------------------------------------------
await otraTransaccion('mati@x');
await prueba(
  'una foto suelta, sin aprobar, no queda al confirmar la transacción',
  async () => {
    await db.exec('savepoint ff');
    let msg = '';
    try {
      await q(`insert into comercial.fotos_pedido (pedido_id) values ($1)`, [p]);
      await db.exec('set constraints all immediate');
    } catch (e) {
      msg = e.message;
    }
    await db.exec('rollback to savepoint ff');
    await db.exec('set constraints all deferred');
    if (!/al aprobar el pedido/.test(msg)) throw new Error(msg || 'no rechazó');
  },
);

// --- Aprobación -------------------------------------------------------------
await usuario('gerente@x', 'GERENCIA', 'ADMINISTRACION');
await como('gerente@x');
await rechaza(
  'Gerencia no aprueba: es de Ventas',
  `select comercial.enviar_venta($1)`,
  /es de Ventas/,
  [p],
);
await como('mati@x');
let foto;
await prueba('Ventas aprueba: foto, fecha comprometida y CONFIRMADO', async () => {
  // La que pidió el cliente: el pedido la pierde al aprobar, la foto la guarda.
  await q(`update comercial.pedidos set fecha_entrega=$2::date where id=$1`, [p, F20]);
  await q(`select comercial.enviar_venta($1)`, [p]);
  const ped = await uno(
    `select estado, fecha_entrega::text f from comercial.pedidos where id=$1`,
    [p],
  );
  foto = await uno(`select * from comercial.fotos_pedido where pedido_id=$1`, [p]);
  if (
    ped.estado !== 'CONFIRMADO' ||
    ped.f !== F30 ||
    dia(foto.fecha_comprometida) !== F30 ||
    dia(foto.fecha_entrega_pedida) !== F20
  )
    throw new Error(JSON.stringify({ ped, foto }));
});
await prueba('lo que falta va a Producción con la fecha comprometida', async () => {
  const s = await uno(
    `select fecha_entrega::text f from comercial.pedidos where para_pedido_id=$1`,
    [p],
  );
  if (!s || s.f !== F30) throw new Error(JSON.stringify(s));
});
await prueba(
  'la foto copia cantidades, precios y neto tal como quedaron, y el vendedor',
  async () => {
    const fr = await q(
      `select fr.cantidad, fr.precio_final, fr.precio_unitario, r.precio_final as actual, r.precio_unitario as neto
       from comercial.fotos_pedido_renglones fr join comercial.pedido_renglones r on r.id = fr.renglon_id
      where fr.foto_id=$1 order by fr.cantidad`,
      [foto.id],
    );
    const yo = await uno(`select core.usuario_actual() u`);
    if (
      fr.length !== 2 ||
      N(fr[1].cantidad) !== 80 ||
      fr.some(
        (x) => N(x.precio_final) !== N(x.actual) || N(x.precio_unitario) !== N(x.neto),
      ) ||
      N(foto.descuento_aplicado) !== 30 ||
      foto.vendedor_id !== yo.u
    )
      throw new Error(JSON.stringify({ fr, foto }));
  },
);
await prueba(
  'cuenta en las estadísticas, imputado al período de la aprobación',
  async () => {
    const v = await uno(`select * from comercial.v_ventas_pedidas where pedido_id=$1`, [
      p,
    ]);
    const tot = await uno(
      `select sum(importe) t from comercial.fotos_pedido_renglones where foto_id=$1`,
      [foto.id],
    );
    const hoy = await uno(
      `select date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date::text m,
            (now() at time zone 'America/Argentina/Buenos_Aires')::date - date '2026-10-01' as d`,
    );
    if (
      !v ||
      N(v.importe_pedido) !== N(tot.t) ||
      dia(v.periodo) !== hoy.m ||
      v.dias_hasta_aprobar !== hoy.d ||
      dia(v.fecha_pedido_cliente) !== '2026-10-01'
    )
      throw new Error(JSON.stringify({ v, tot, hoy }));
  },
);
await rechaza(
  'la foto no se edita',
  `update comercial.fotos_pedido_renglones set cantidad = 1`,
  /permission denied/,
);
await rechaza('ni se borra', `delete from comercial.fotos_pedido`, /permission denied/);
await rechaza(
  'ni se le agrega un renglón de otro pedido',
  `insert into comercial.fotos_pedido_renglones (foto_id, renglon_id, producto_id, cantidad, precio_manual, alicuota_iva)
   select $1, r.id, r.producto_id, 999, false, 21 from comercial.pedido_renglones r where r.pedido_id <> $2 limit 1`,
  /no es de este pedido/,
  [foto.id, p],
);
await rechaza(
  'ni se toma una foto de un pedido ya aprobado',
  `insert into comercial.fotos_pedido (pedido_id) values ($1)`,
  /al aprobar/,
  [p],
);
await otraTransaccion('mati@x');
await rechaza(
  'en otra transacción no se le suman renglones a la foto',
  `insert into comercial.fotos_pedido_renglones (foto_id, renglon_id, producto_id, cantidad, precio_manual, alicuota_iva) values ($1,$2,$3,999,false,21)`,
  /se copian al tomarla/,
  [foto.id, rPack, pack],
);

// --- Reaprobación ----------------------------------------------------------
await prueba('volver a borrador saca el pedido de las estadísticas', async () => {
  await q(`update comercial.pedidos set estado='BORRADOR' where id=$1`, [p]);
  const n = await uno(
    `select count(*)::int n from comercial.v_ventas_pedidas where pedido_id=$1`,
    [p],
  );
  if (n.n !== 0) throw new Error(String(n.n));
  await q(`update comercial.pedido_renglones set cantidad=10 where id=$1`, [rPack]);
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [p]);
});
await otraTransaccion('naza@x');
await proponer(p, F35);
await otraTransaccion('mati@x');
await prueba('volver a aprobar deja historial: suma solo la foto vigente', async () => {
  await q(`select comercial.enviar_venta($1)`, [p]);
  const v = await uno(`select * from comercial.v_ventas_pedidas where pedido_id=$1`, [p]);
  const n = await uno(
    `select count(*)::int n from comercial.fotos_pedido where pedido_id=$1`,
    [p],
  );
  const ult = await uno(
    `select sum(fr.importe) t from comercial.fotos_pedido_renglones fr
       join comercial.fotos_pedido f on f.id = fr.foto_id
      where f.pedido_id=$1 and f.id <> $2`,
    [p, foto.id],
  );
  if (
    n.n !== 2 ||
    v.aprobaciones !== 2 ||
    N(v.importe_pedido) !== N(ult.t) ||
    v.foto_id === foto.id
  )
    throw new Error(JSON.stringify({ n, v, ult }));
});

await prueba('cada propuesta y cada foto quedan en la auditoría', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*) filter (where tabla='propuestas_fecha')::int pf,
            count(*) filter (where tabla='propuestas_fecha_renglones')::int pr,
            count(*) filter (where tabla='fotos_pedido')::int fp,
            count(*) filter (where tabla='fotos_pedido_renglones')::int fr
       from core.auditoria where operacion='INSERT'`,
  );
  if (a.pf !== 3 || a.pr !== 1 || a.fp !== 2 || a.fr !== 4)
    throw new Error(JSON.stringify(a));
});

// --- Todo en una transacción: gana siempre la última ------------------------
// Dos propuestas y dos aprobaciones del mismo pedido sin cortar la
// transacción: propuesta_en y aprobada_en empatan (now()), y la vigente la
// decide la columna orden, no el azar del uuid. Cinco pedidos, para que no
// dependa de una tirada.
await otraTransaccion('mati@x');
const VUELTAS = 5;
await prueba(
  `misma transacción, ${VUELTAS} pedidos: la vigente es siempre la última propuesta y la última foto`,
  async () => {
    const malos = [];
    for (let i = 0; i < VUELTAS; i++) {
      await como('mati@x');
      const x = (
        await uno(
          `insert into comercial.pedidos (numero, cliente, cliente_id, es_venta) values ($1,'Cliente mayorista',$2,true) returning id`,
          [`V-T${i}`, cli],
        )
      ).id;
      const rx = await nuevoRenglon(x, mono, 4);
      await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [x]);
      await como('naza@x');
      await proponer(x, F20);
      await como('mati@x');
      await q(`update comercial.pedido_renglones set cantidad=5 where id=$1`, [rx]); // vuelve a esperar fecha
      await como('naza@x');
      await proponer(x, F25); // segunda propuesta, misma transacción
      await como('mati@x');
      await q(`select comercial.enviar_venta($1)`, [x]);
      const f1 = await uno(
        `select p.fecha_entrega::text f, (select fecha_comprometida::text from comercial.fotos_pedido where pedido_id=p.id) fc
         from comercial.pedidos p where p.id=$1`,
        [x],
      );
      if (f1.fc !== F25) malos.push({ i, primeraFoto: f1 });
      // Segunda aprobación en la misma transacción.
      await q(`update comercial.pedidos set estado='BORRADOR' where id=$1`, [x]);
      await q(`update comercial.pedido_renglones set cantidad=6 where id=$1`, [rx]);
      await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [x]);
      await como('naza@x');
      await proponer(x, F30);
      await como('mati@x');
      await q(`select comercial.enviar_venta($1)`, [x]);
      const f2 = await uno(
        `select fecha_entrega::text f from comercial.pedidos where id=$1`,
        [x],
      );
      // La última foto es la de 6 unidades (la primera tenía 5). No se mira la
      // columna orden: la prueba vale igual contra una versión sin ella.
      const fotos = await q(
        `select aprobada_en = now() as ahora from comercial.fotos_pedido where pedido_id=$1`,
        [x],
      );
      const v = await uno(
        `select unidades, fecha_comprometida::text fc from comercial.v_ventas_pedidas where pedido_id=$1`,
        [x],
      );
      const empatan = fotos.length === 2 && fotos.every((f) => f.ahora);
      if (f1.f !== F25 || f2.f !== F30 || !empatan || N(v.unidades) !== 6 || v.fc !== F30)
        malos.push({ i, f1, f2, v });
    }
    if (malos.length) throw new Error(JSON.stringify(malos));
  },
);
// Las fotos se confirman con su pedido CONFIRMADO (control diferido).
await otraTransaccion('mati@x');

await invariantes();
fin();
