// Producción por producto (20261019140000, D-ventas-pedidos-17): al aprobar
// una venta, un S-xxxx por producto que falta; Gerencia de Producción elige
// para qué venta va cada uno, o stock; y carga producción nueva desde el Gantt.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
const N = (x) => Number(x ?? 0);
const imm = () => db.exec('set constraints all immediate; set constraints all deferred');
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const pack = await prod('80PACK'),
  mono = await prod('101'),
  otro = await prod('102');
const S = (venta) =>
  q(
    `select p.id, p.numero, p.cliente, p.estado, p.destino_deposito_id, r.producto_id, r.cantidad
       from comercial.pedidos p join comercial.pedido_renglones r on r.pedido_id = p.id
      where p.para_pedido_id = $1 order by p.numero`,
    [venta],
  );
const c5 = (await uno(`select id from gmp.depositos where numero='C5'`)).id;

// Una venta aprobada por el circuito de 20261019130100.
const aprobada = async (numero, renglones) => {
  await como('mati@x');
  const v = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta) values ($1,'Cliente ' || $1, true) returning id`,
      [numero],
    )
  ).id;
  for (const [p, c] of renglones)
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
      [v, p, c],
    );
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [v]);
  await como('naza@x');
  await q(`select comercial.proponer_fecha($1, current_date + 10)`, [v]);
  await como('mati@x');
  await q(`select comercial.enviar_venta($1)`, [v]);
  await imm();
  return v;
};

let v1, v2;
await prueba('al aprobar, lo que falta va en un S-xxxx por producto', async () => {
  v1 = await aprobada('V-1', [
    [mono, 30],
    [otro, 12],
  ]);
  const s = await S(v1);
  if (s.length !== 2 || new Set(s.map((x) => x.id)).size !== 2)
    throw new Error(JSON.stringify(s));
  const porProd = new Map(s.map((x) => [x.producto_id, x]));
  if (N(porProd.get(mono)?.cantidad) !== 30 || N(porProd.get(otro)?.cantidad) !== 12)
    throw new Error(JSON.stringify(s));
  if (
    s.some(
      (x) =>
        x.estado !== 'CONFIRMADO' ||
        x.destino_deposito_id !== c5 ||
        x.cliente !== 'Para V-1 — Cliente V-1',
    )
  )
    throw new Error(JSON.stringify(s));
});
v2 = await aprobada('V-2', [[mono, 5]]);
await como('naza@x');
const sMono = (await S(v1)).find((x) => x.producto_id === mono);
await prueba(
  'Gerencia de Producción lo pasa a otra venta que lleva el producto',
  async () => {
    await q(`update comercial.pedidos set para_pedido_id=$2 where id=$1`, [sMono.id, v2]);
    const p = await uno(
      `select cliente, destino_deposito_id, fecha_entrega from comercial.pedidos where id=$1`,
      [sMono.id],
    );
    const v = await uno(`select fecha_entrega from comercial.pedidos where id=$1`, [v2]);
    if (
      p.cliente !== 'Para V-2 — Cliente V-2' ||
      p.destino_deposito_id !== c5 ||
      String(p.fecha_entrega) !== String(v.fecha_entrega)
    )
      throw new Error(JSON.stringify({ p, v }));
  },
);
const sOtro = (await S(v1)).find((x) => x.producto_id === otro);
await rechaza(
  'no a una venta que no lleva ese producto',
  `update comercial.pedidos set para_pedido_id='${v2}' where id='${sOtro.id}'`,
  /no lleva lo que produce/,
);
await rechaza(
  'ni a algo que no es una venta aprobada',
  `update comercial.pedidos set para_pedido_id='${sOtro.id}' where id='${sMono.id}'`,
  /venta aprobado/,
);
await prueba('o lo deja para stock', async () => {
  await q(`update comercial.pedidos set para_pedido_id=null where id=$1`, [sOtro.id]);
  const p = await uno(`select cliente, para_stock from comercial.pedidos where id=$1`, [
    sOtro.id,
  ]);
  if (p.cliente !== 'Para stock' || !p.para_stock) throw new Error(JSON.stringify(p));
});
await como('mati@x');
await rechaza(
  'Ventas no cambia el destino de una producción',
  `update comercial.pedidos set para_pedido_id='${v1}' where id='${sOtro.id}'`,
  /Gerencia de Producción/,
);
await rechaza(
  'una venta no se manda «para» otra venta',
  `update comercial.pedidos set para_pedido_id='${v1}' where id='${v2}'`,
  /Gerencia de Producción|pedido de producción/,
);

await como('naza@x');
let nueva;
await prueba('nueva producción para una venta, ya planificada', async () => {
  nueva = (
    await uno(`select comercial.crear_produccion($1, 40, $2, current_date + 2, 3) id`, [
      mono,
      v1,
    ])
  ).id;
  const p = await uno(
    `select numero, cliente, estado, para_pedido_id, destino_deposito_id, plan_inicio, plan_dias from comercial.pedidos where id=$1`,
    [nueva],
  );
  const r = await q(
    `select producto_id, cantidad from comercial.pedido_renglones where pedido_id=$1`,
    [nueva],
  );
  if (
    !/^S-\d{4}$/.test(p.numero) ||
    p.estado !== 'CONFIRMADO' ||
    p.para_pedido_id !== v1 ||
    p.destino_deposito_id !== c5 ||
    p.plan_dias !== 3 ||
    r.length !== 1 ||
    N(r[0].cantidad) !== 40
  )
    throw new Error(JSON.stringify({ p, r }));
});
await prueba('y para stock, a la fábrica', async () => {
  const id = (await uno(`select comercial.crear_produccion($1, 100) id`, [pack])).id;
  const p = await uno(
    `select cliente, para_pedido_id, destino_deposito_id, plan_inicio from comercial.pedidos where id=$1`,
    [id],
  );
  if (
    p.cliente !== 'Para stock' ||
    p.para_pedido_id !== null ||
    p.destino_deposito_id !== null ||
    p.plan_inicio !== null
  )
    throw new Error(JSON.stringify(p));
});
await rechaza(
  'no para una venta que no lleva el producto',
  `select comercial.crear_produccion('${pack}', 5, '${v2}')`,
  /no lleva este producto/,
);
await rechaza(
  'ni con cantidad cero',
  `select comercial.crear_produccion('${pack}', 0)`,
  /mayor que cero/,
);
await rechaza(
  'ni con medio plan',
  `select comercial.crear_produccion('${pack}', 5, null, current_date)`,
  /inicio y días/,
);
await como('op@x');
await rechaza(
  'un operario no carga producción',
  `select comercial.crear_produccion('${pack}', 5)`,
  /Gerencia de Producción/,
);

await como('naza@x');
await prueba(
  'al terminar en Calle 5, se reserva para la venta elegida, no para la original',
  async () => {
    const cons = (
      await q(`select insumo_id from comercial.necesidad_pedido($1)`, [sMono.id])
    ).map((x) => ({
      insumo_id: x.insumo_id,
      cantidad: 0,
      motivo: 'prueba sin material',
    }));
    await q(`select comercial.terminar_pedido($1, $2::jsonb, $3::jsonb)`, [
      sMono.id,
      JSON.stringify(cons),
      JSON.stringify([{ producto_id: mono, cantidad: 30, deposito: 'C5' }]),
    ]);
    await imm();
    const r2 = await uno(
      `select coalesce(sum(cantidad - consumido), 0) n from comercial.reservas_pt where pedido_id=$1 and producto_id=$2 and not liberada`,
      [v2, mono],
    );
    const r1 = await uno(
      `select coalesce(sum(cantidad - consumido), 0) n from comercial.reservas_pt where pedido_id=$1 and producto_id=$2 and not liberada`,
      [v1, mono],
    );
    // V-2 pide 5: se le reservan 5. A V-1 no le toca nada de este S-xxxx.
    if (N(r2.n) !== 5 || N(r1.n) !== 0) throw new Error(JSON.stringify({ r1, r2 }));
  },
);
await rechaza(
  'terminado, ya no cambia de destino',
  `update comercial.pedidos set para_pedido_id='${v1}' where id='${sMono.id}'`,
  /cerrado|no se modifica/,
);

await invariantes();
fin();
