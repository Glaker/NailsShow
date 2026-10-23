// Envase etiquetado (20261021120000): etiquetar descuenta envase y etiqueta, y
// el pedido después consume los etiquetados sin descontar dos veces.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como('naza@x');
const prod = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('PX1', 'Esmalte X', 36) returning id`,
  )
).id;
const insumo = async (codigo, tipo) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, 'UNIDAD', false) returning id`,
      [codigo, tipo],
    )
  ).id;
const envase = await insumo('ENV-E1', 'MATERIAL_ENVASE');
const etiqueta = await insumo('ETQ-E1', 'ETIQUETA');
const tapa = await insumo('TAP-E1', 'MATERIAL_ENVASE');

await prueba(
  'el producto sin envase ni etiqueta aparece en tareas de carga',
  async () => {
    const t = await uno(`select * from comercial.v_tareas_carga where producto_id = $1`, [
      prod,
    ]);
    if (!t || t.envase_id || t.etiqueta_id || t.tiene_formula)
      throw new Error(JSON.stringify(t));
  },
);
await rechaza(
  'sin envase y etiqueta definidos no se etiqueta',
  `select comercial.registrar_etiquetado('${prod}', 5)`,
  /no tiene envase y etiqueta/,
);

for (const [ins, rol] of [
  [envase, 'ENVASE'],
  [etiqueta, 'ETIQUETA'],
  [tapa, 'EXTRA'],
])
  await q(
    `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol) values ($1, $2, 1, $3)`,
    [prod, ins, rol],
  );

// Desde 20261022200200 (D-ajustes-3) puede haber más de un envase: lo prueba
// probar_materiales_reventa.mjs.

// Stock: recepción de 100 de cada uno, cargada y aprobada por atajo.
const prov = (
  await uno(
    `insert into gmp.proveedores (razon_social) values ('Prov E') returning id`,
  ).catch(async () => {
    await db.exec('reset role');
    return uno(
      `insert into gmp.proveedores (razon_social) values ('Prov E') returning id`,
    );
  })
).id;
await como('naza@x');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-E', true) returning id`,
    [prov],
  )
).id;
const lotes = [];
for (const ins of [envase, etiqueta, tapa])
  lotes.push(
    (
      await uno(
        `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
         values ($1, $2, 'L', 1, 100, 'UNIDAD', true) returning id`,
        [rec, ins],
      )
    ).id,
  );
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [lotes]);
await db.exec('set session_replication_role = origin');

const saldo = async (ins) =>
  Number(
    (
      await uno(
        `select coalesce(sum(s.saldo), 0) s from comercial.v_saldos_stock s
          join comercial.articulos a on a.id = s.articulo_id where a.insumo_id = $1`,
        [ins],
      )
    ).s,
  );

await como('ventas@x');
await rechaza(
  'Ventas no etiqueta',
  `select comercial.registrar_etiquetado('${prod}', 5)`,
  /Gerencia de Producción/,
);

await como('naza@x');
await prueba('etiquetar 30 descuenta 30 envases y 30 etiquetas, no tapas', async () => {
  await q(`select comercial.registrar_etiquetado($1, 30)`, [prod]);
  const [e, t, ta] = [await saldo(envase), await saldo(etiqueta), await saldo(tapa)];
  if (e !== 70 || t !== 70 || ta !== 100) throw new Error(`${e} ${t} ${ta}`);
});
await rechaza(
  'no se etiqueta más de lo que hay',
  `select comercial.registrar_etiquetado('${prod}', 80)`,
  /No alcanza/,
);
await prueba(
  'para los faltantes, lo etiquetado sigue siendo envase y etiqueta',
  async () => {
    const d = await uno(
      `select disponible from comercial.v_disponible_por_insumo where insumo_id = $1`,
      [envase],
    );
    if (Number(d.disponible) !== 100) throw new Error(d.disponible);
    const x = await uno(`select comercial.disponible_para($1, null, null) d`, [envase]);
    if (Number(x.d) !== 100) throw new Error('disponible_para ' + x.d);
  },
);
let mal;
await prueba(
  'un etiquetado mal cargado se anula y devuelve envase y etiqueta',
  async () => {
    mal = (await uno(`select (comercial.registrar_etiquetado($1, 5)).id`, [prod])).id;
    if ((await saldo(envase)) !== 65) throw new Error('no descontó');
    await q(`select comercial.anular_etiquetado($1, 'cargué de más')`, [mal]);
    const [e, t] = [await saldo(envase), await saldo(etiqueta)];
    if (e !== 70 || t !== 70) throw new Error(`${e} ${t}`);
    const s = await uno(`select comercial.etiquetados_en_stock($1) n`, [prod]);
    if (Number(s.n) !== 30) throw new Error(String(s.n));
  },
);
await rechaza(
  'y no se anula dos veces',
  `select comercial.anular_etiquetado('${mal}', 'otra vez')`,
  /ya está anulado/,
);
await db.exec('reset role');
const ter =
  (await uno(`select id from gmp.terceros limit 1`)) ??
  (await uno(`insert into gmp.terceros (nombre) values ('Cliente T') returning id`));
const deTercero = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses, tercero_id) values ('TPX', 'De tercero', 36, $1) returning id`,
    [ter.id],
  )
).id;
await como('naza@x');
await rechaza(
  'un producto tercerizado no se etiqueta acá',
  `select comercial.registrar_etiquetado('${deTercero}', 1)`,
  /tercerizado/,
);

// Pedido de 50.
await como(DT);
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [prod],
  )
).id;
await como('naza@x');
const p = (
  await uno(
    `insert into comercial.pedidos (numero, cliente) values ('P-E', 'Ana') returning id`,
  )
).id;
await q(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,50,1)`,
  [p, prod],
);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
const o = (
  await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,1,1) returning id`,
    [f, prod],
  )
).id;
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [
  p,
  o,
]);

await prueba('faltan etiquetar 20 de 50', async () => {
  const v = await uno(
    `select * from comercial.v_faltan_etiquetar where producto_id = $1`,
    [prod],
  );
  if (
    Number(v.pendientes) !== 50 ||
    Number(v.en_stock) !== 30 ||
    Number(v.faltan) !== 20 ||
    Number(v.etiquetados_hoy) !== 30 ||
    !v.definido
  )
    throw new Error(JSON.stringify(v));
});
await prueba('el teórico del pedido ya descuenta los etiquetados', async () => {
  const n = await q(`select * from comercial.necesidad_pedido_neta($1)`, [p]);
  const de = (id) => Number(n.find((x) => x.insumo_id === id)?.necesario);
  if (de(envase) !== 20 || de(etiqueta) !== 20 || de(tapa) !== 50)
    throw new Error(JSON.stringify(n));
});
await prueba(
  'terminar el pedido toma los 30 etiquetados y 20 sueltos, y 50 tapas',
  async () => {
    await q(`select comercial.terminar_pedido($1)`, [p]);
    const [e, t, ta] = [await saldo(envase), await saldo(etiqueta), await saldo(tapa)];
    if (e !== 50 || t !== 50 || ta !== 50) throw new Error(`${e} ${t} ${ta}`);
    const pe = await uno(
      `select coalesce(sum(cantidad), 0)::int n from comercial.pedido_etiquetados where pedido_id = $1`,
      [p],
    );
    if (pe.n !== 30) throw new Error(String(pe.n));
    const s = await uno(`select comercial.etiquetados_en_stock($1) n`, [prod]);
    if (Number(s.n) !== 0) throw new Error(String(s.n));
  },
);
await prueba(
  'la traza del lote llega al envase y la etiqueta que vinieron etiquetados',
  async () => {
    const t = await q(
      `select codigo_interno, sum(cantidad)::numeric n from comercial.v_trazabilidad_orden
      where orden_id = $1 and sentido = 'INSUMO' group by codigo_interno`,
      [o],
    );
    const de = (c) => Number(t.find((x) => x.codigo_interno === c)?.n);
    if (de('ENV-E1') !== 50 || de('ETQ-E1') !== 50 || de('TAP-E1') !== 50)
      throw new Error(JSON.stringify(t));
  },
);
await rechaza(
  'el consumo del etiquetado no se edita',
  `update comercial.etiquetados set cantidad = 1 where producto_id = '${prod}' returning id`,
  /permission|denied|policy/i,
);

await prueba('Gerencia de Producción carga una fórmula en borrador', async () => {
  const otro = (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('PX2', 'Otro', 36) returning id`,
    )
  ).id;
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1, '00') returning id`,
    [otro],
  );
});
await rechaza(
  'pero solo en borrador (la política le cierra cualquier otro estado)',
  `insert into gmp.formulas_fabricacion (producto_id, version, estado) values ('${prod}', '01', 'LISTO_PARA_EMITIR')`,
  /row-level security|policy/i,
);
await prueba(
  '«no corresponde» saca al producto de las tareas si ya tiene envase y etiqueta',
  async () => {
    const otro = (await uno(`select id from gmp.productos where codigo_interno = 'PX1'`))
      .id;
    await q(`update gmp.productos set sin_formula = true where id = $1`, [otro]);
    const t = await q(`select 1 from comercial.v_tareas_carga where producto_id = $1`, [
      otro,
    ]);
    if (t.length !== 0) throw new Error('sigue en tareas');
  },
);
await invariantes();
fin();
