// Envasado por días (20261028140000, D-tandas-1): con el granel aprobado, Naza
// carga lo que salió cada día; entra al stock con el lote de la orden y
// descuenta envase y etiqueta de ese día; la materia prima, una vez.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como('naza@x');
const prod = async (codigo) =>
  (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ($1, $1, 24) returning id`,
      [codigo],
    )
  ).id;
const rem = await prod('REM200');
const chico = await prod('REM100');
await q(`select gmp.vincular_hermano($1, $2)`, [rem, chico]);
const insumo = async (codigo, tipo, unidad) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, $3, false) returning id`,
      [codigo, tipo, unidad],
    )
  ).id;
const base = await insumo('BASE', 'MATERIA_PRIMA', 'kg');
const env200 = await insumo('ENV200', 'MATERIAL_ENVASE', 'UNIDAD');
const env100 = await insumo('ENV100', 'MATERIAL_ENVASE', 'UNIDAD');
const etq = await insumo('ETQ', 'ETIQUETA', 'UNIDAD');
for (const [p, i, rol] of [
  [rem, env200, 'ENVASE'],
  [rem, etq, 'ETIQUETA'],
  [chico, env100, 'ENVASE'],
  [chico, etq, 'ETIQUETA'],
])
  await q(
    `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol) values ($1,$2,1,$3)`,
    [p, i, rol],
  );

// Stock aprobado.
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov T') returning id`)
).id;
await como('naza@x');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-T', true) returning id`,
    [prov],
  )
).id;
const lotes = [];
for (const [ins, cant, u] of [
  [base, 10, 'kg'],
  [env200, 1000, 'UNIDAD'],
  [env100, 1000, 'UNIDAD'],
  [etq, 2000, 'UNIDAD'],
])
  lotes.push(
    (
      await uno(
        `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
         values ($1, $2, 'L', 1, $3, $4, true) returning id`,
        [rec, ins, cant, u],
      )
    ).id,
  );
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [lotes]);
await db.exec('set session_replication_role = origin');
const saldo = async (ins) =>
  N(
    (
      await uno(
        `select coalesce(sum(s.saldo), 0) s from comercial.v_saldos_stock s
          join comercial.articulos a on a.id = s.articulo_id where a.insumo_id = $1`,
        [ins],
      )
    ).s,
  );

await como(DT);
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [rem],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, 1, $2, 100)`,
  [f, base],
);
await como('naza@x');
const o = (
  await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, unidades_previstas)
     values ($1,$2,current_date,1,2,900) returning id`,
    [f, rem],
  )
).id;
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
const enPtf = async (p) =>
  N(
    (
      await uno(
        `select coalesce(sum(cantidad),0) s from comercial.movimientos_pt where orden_id=$1 and producto_id=$2 and deposito_id=$3`,
        [o, p, PTF],
      )
    ).s,
  );
const tanda = (reparto, extra = '') =>
  `select comercial.registrar_tanda('${o}', current_date, '${JSON.stringify(reparto)}'::jsonb${extra})`;

await rechaza(
  'sin el granel aprobado no se carga',
  tanda([{ producto_id: rem, unidades: 200 }]),
  /no está aprobado/,
);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1, 'CC_GRANEL', '{"aprobado": true}')`,
  [o],
);
await db.exec('set session_replication_role = origin');

await como(DT);
await rechaza(
  'la DT no carga lo que salió',
  tanda([{ producto_id: rem, unidades: 200 }]),
  /Gerencia de Producción/,
);

await como('naza@x');
await prueba(
  'día 1: 200 de 200 ml entran retenidos con el lote y descuentan su envase y etiqueta',
  async () => {
    const n = (await uno(tanda([{ producto_id: rem, unidades: 200 }]) + ' n')).n;
    if (n !== 1) throw new Error('numero ' + n);
    if ((await enPtf(rem)) !== 200) throw new Error('stock');
    if ((await saldo(env200)) !== 800 || (await saldo(etq)) !== 1800)
      throw new Error('envase/etiqueta');
  },
);
await prueba('y la materia prima del granel, una vez', async () => {
  if ((await saldo(base)) !== 8) throw new Error('base ' + (await saldo(base)));
});
await prueba(
  'día 2: 300 de 200 ml y 100 de 100 ml; la materia prima no se repite',
  async () => {
    await q(
      tanda([
        { producto_id: rem, unidades: 300 },
        { producto_id: chico, unidades: 100 },
      ]),
    );
    if ((await enPtf(rem)) !== 500 || (await enPtf(chico)) !== 100)
      throw new Error('stock');
    if (
      (await saldo(env100)) !== 900 ||
      (await saldo(etq)) !== 1400 ||
      (await saldo(base)) !== 8
    )
      throw new Error('consumos');
  },
);
await prueba('con envases ya etiquetados, la tanda usa esos primero', async () => {
  await q(`select comercial.registrar_etiquetado($1, 50)`, [chico]);
  const antes = { env: await saldo(env100), etq: await saldo(etq) };
  await q(tanda([{ producto_id: chico, unidades: 80 }]));
  if ((await saldo(env100)) !== antes.env - 30 || (await saldo(etq)) !== antes.etq - 30)
    throw new Error(
      JSON.stringify({ antes, env: await saldo(env100), etq: await saldo(etq) }),
    );
  const s = await uno(`select comercial.etiquetados_en_stock($1) n`, [chico]);
  if (N(s.n) !== 0) throw new Error('etiquetados ' + s.n);
});
await rechaza(
  'sin unidades no es una tanda',
  tanda([{ producto_id: rem, unidades: 0 }]),
  /cuántas unidades/,
);
await prueba('el batch record tiene las tres tandas', async () => {
  const t = await q(
    `select numero, sum(unidades) u from gmp.orden_tandas where orden_id=$1 group by numero order by numero`,
    [o],
  );
  if (t.map((x) => N(x.u)).join() !== '200,400,80') throw new Error(JSON.stringify(t));
});

await rechaza(
  'una tanda no se inserta suelta (sin descontar)',
  `insert into gmp.orden_tandas (orden_id, numero, fecha, producto_id, unidades) values ('${o}', 9, current_date, '${rem}', 5)`,
  /row-level security/,
);
const ped = (
  await uno(
    `insert into comercial.pedidos (numero, cliente) values ('P-T', 'Ana') returning id`,
  )
).id;
await q(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,100,1)`,
  [ped, rem],
);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [
  ped,
  o,
]);
await rechaza(
  'el pedido no se termina mientras su orden se envasa por días',
  `select comercial.terminar_pedido('${ped}', '[]'::jsonb)`,
  /envasando por días/,
);

await como('op@x');
await q(
  `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`,
  [o],
);
await como('naza@x');
await rechaza(
  'para terminar pide la cantidad de granel',
  tanda([], ', null, true'),
  /cantidad de granel/,
);
await prueba(
  'la última tanda termina la orden con el total, sin cargar dos veces',
  async () => {
    await q(tanda([{ producto_id: rem, unidades: 100 }], ", 'último día', true, 1.95"));
    const r = await uno(
      `select estado, unidades_obtenidas from gmp.ordenes_produccion where id=$1`,
      [o],
    );
    if (r.estado !== 'TERMINADA' || N(r.unidades_obtenidas) !== 780)
      throw new Error(JSON.stringify(r));
    if (
      (await enPtf(rem)) !== 600 ||
      (await enPtf(chico)) !== 180 ||
      (await saldo(base)) !== 8
    )
      throw new Error('stock o materia prima');
  },
);
await rechaza(
  'terminada, no se cargan más',
  tanda([{ producto_id: rem, unidades: 1 }]),
  /no se le cargan más/,
);
await prueba(
  'el «Terminado» del pedido no vuelve a descontar lo que envasaron las tandas',
  async () => {
    const n = await q(
      `select insumo_id, necesario from comercial.necesidad_pedido_neta($1)`,
      [ped],
    );
    if (n.some((x) => N(x.necesario) !== 0)) throw new Error(JSON.stringify(n));
  },
);
await invariantes();
fin();
