// Fórmula en % V/V y consumo de materia prima al terminar la orden
// (20261028120000, D-consumo-orden-1): removedor 50 % acetona / 50 % etanol,
// orden de 100 ml → 50 ml de cada uno, del lote que vence primero.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como(DT);
const prod = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('REM1', 'Removedor', 24) returning id`,
  )
).id;
const insumo = async (codigo, unidad, densidad) => {
  const id = (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, 'MATERIA_PRIMA', $2, false) returning id`,
      [codigo, unidad],
    )
  ).id;
  if (densidad) {
    const d = (
      await uno(
        `insert into gmp.densidades_referencia (nombre, densidad_ref, fuente) values ($1, $2, 'LITERATURA') returning id`,
        [codigo, densidad],
      )
    ).id;
    await q(`update gmp.insumos_catalogo set densidad_referencia_id = $1 where id = $2`, [
      d,
      id,
    ]);
  }
  return id;
};
const acetona = await insumo('ACETONA', 'ml', 0.79);
const etanol = await insumo('ETANOL', 'l', 0.789);

const formula = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version, base_porcentaje) values ($1, '01', 'VV') returning id`,
    [prod],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, 1, $2, 50), ($1, 2, $3, 50)`,
  [formula, acetona, etanol],
);

await prueba(
  'en V/V, 100 ml dan 50 ml de cada uno y la masa con su densidad',
  async () => {
    const r = await q(
      `select * from gmp.calcular_lote($1, p_volumen_l => 0.1) order by orden`,
      [formula],
    );
    if (N(r[0].volumen_l) !== 0.05 || N(r[1].volumen_l) !== 0.05)
      throw new Error(JSON.stringify(r));
    if (Math.abs(N(r[0].masa_kg) - 0.0395) > 1e-4)
      throw new Error('masa ' + r[0].masa_kg);
  },
);
await prueba('en kg, pasa a volumen con la densidad ideal de la mezcla', async () => {
  const r = await q(
    `select * from gmp.calcular_lote($1, p_masa_kg => 0.0790) order by orden`,
    [formula],
  );
  if (Math.abs(N(r[0].volumen_l) - 0.05) > 1e-3) throw new Error(JSON.stringify(r));
});

// Stock aprobado: dos lotes de acetona (el que vence primero sale primero) y uno de etanol.
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov C') returning id`)
).id;
await como('naza@x');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-C', true) returning id`,
    [prov],
  )
).id;
const lote = async (ins, cant, unidad, vence) =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados, plazo_validez)
       values ($1, $2, 'L', 1, $3, $4, true, $5) returning id`,
      [rec, ins, cant, unidad, vence],
    )
  ).id;
const aTarde = await lote(acetona, 1000, 'ml', '2029-01-01');
const aPronto = await lote(acetona, 30, 'ml', '2027-01-01');
const e1 = await lote(etanol, 1, 'l', '2028-01-01');
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [
  [aTarde, aPronto, e1],
]);
await db.exec('set session_replication_role = origin');
const saldoLote = async (l) =>
  N(
    (
      await uno(
        `select coalesce(sum(saldo), 0) s from comercial.v_saldos_stock where lote_insumo_id = $1`,
        [l],
      )
    ).s,
  );

const orden = async (partida, cantidad, unidad) => {
  await como('naza@x');
  const o = (
    await uno(
      `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, unidad)
       values ($1, $2, current_date, $3, $4, $5) returning id`,
      [formula, prod, partida, cantidad, unidad],
    )
  ).id;
  await como('op@x');
  await q(
    `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`,
    [o],
  );
  await como('naza@x');
  return o;
};

const o1 = await orden(1, 0.1, 'L');
await prueba(
  'terminar la orden descuenta 50 ml de acetona y 0,05 l de etanol',
  async () => {
    await q(`select comercial.terminar_orden($1, 0.1, 1)`, [o1]);
    const c = await q(
      `select insumo_id, unidad, cantidad from comercial.orden_consumos where orden_id = $1`,
      [o1],
    );
    const de = (i) => N(c.find((x) => x.insumo_id === i)?.cantidad);
    if (de(acetona) !== 50 || de(etanol) !== 0.05) throw new Error(JSON.stringify(c));
    if ((await saldoLote(aPronto)) !== 0 || (await saldoLote(aTarde)) !== 980)
      throw new Error('primero el que vence antes');
    if ((await saldoLote(e1)) !== 0.95)
      throw new Error('etanol ' + (await saldoLote(e1)));
  },
);
await rechaza(
  'el consumo no se registra suelto',
  `insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, documento_tipo, documento_id)
   select s.articulo_id, s.lote_insumo_id, s.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -1, 'ORDEN_CONSUMO',
          (select id from comercial.orden_consumos where orden_id = '${o1}' and insumo_id = '${acetona}')
     from comercial.v_saldos_stock s where s.lote_insumo_id = '${aTarde}'`,
  /ya suman/,
);

await prueba(
  'volver a terminarla (corregir lo obtenido) no descuenta otra vez',
  async () => {
    await q(`select comercial.terminar_orden($1, 0.1, 1)`, [o1]);
    if ((await saldoLote(aTarde)) !== 980) throw new Error('descontó dos veces');
  },
);

const o2 = await orden(2, 5, 'L');
await rechaza(
  'no se registra un consumo de una orden sin terminar',
  `insert into comercial.orden_consumos (orden_id, insumo_id, unidad, cantidad) values ('${o2}', '${acetona}', 'ml', 1)`,
  /row-level security/,
);
await rechaza(
  'si no alcanza el stock, la orden no se termina',
  `select comercial.terminar_orden('${o2}', 5, 50)`,
  /No alcanza/,
);
await prueba('y no quedó nada a medias', async () => {
  const o = await uno(`select estado from gmp.ordenes_produccion where id = $1`, [o2]);
  if (o.estado !== 'ABIERTA') throw new Error(o.estado);
});

// Un insumo en kg dentro de una fórmula V/V necesita su densidad.
await como(DT);
const glicerina = await insumo('GLICERINA', 'kg', null);
const f2 = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version, base_porcentaje) values ($1, '02', 'VV') returning id`,
    [prod],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp, es_csp) values ($1, 1, $2, null, true)`,
  [f2, glicerina],
);
await como('naza@x');
const o3 = (
  await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, unidad)
     values ($1, $2, current_date, 3, 1, 'L') returning id`,
    [f2, prod],
  )
).id;
await como('op@x');
await q(
  `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`,
  [o3],
);
await como('naza@x');
// V/V en kg sin densidad del producto: dice qué componente no la tiene.
await rechaza(
  'en V/V y kg, sin densidad dice cuál falta',
  `select * from gmp.calcular_lote('${f2}', p_masa_kg => 1)`,
  /no tienen densidad: GLICERINA/,
);
await rechaza(
  'sin densidad no se descuenta y avisa cuál',
  `select comercial.terminar_orden('${o3}', 1, 1)`,
  /GLICERINA hace falta su densidad/,
);

await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.formulas_fabricacion set estado = 'EN_REVISION' where id = $1`, [
  formula,
]);
await db.exec('set session_replication_role = origin');
await como(DT);
await rechaza(
  'P/P o V/V no se cambia en una fórmula que ya no es borrador',
  `update gmp.formulas_fabricacion set base_porcentaje = 'PP' where id = '${formula}'`,
  /versión nueva/,
);
await prueba('una versión nueva conserva V/V', async () => {
  const id = (await uno(`select gmp.nueva_version_formula($1) id`, [formula])).id;
  const f = await uno(
    `select base_porcentaje from gmp.formulas_fabricacion where id = $1`,
    [id],
  );
  if (f.base_porcentaje !== 'VV') throw new Error(f.base_porcentaje);
});
await prueba(
  'pegar componentes en un borrador vacío toma la base de la original',
  async () => {
    const vacia = (
      await uno(
        `insert into gmp.formulas_fabricacion (producto_id, version) values ($1, '09') returning id`,
        [prod],
      )
    ).id;
    await q(`select gmp.copiar_componentes($1, $2)`, [formula, vacia]);
    const f = await uno(
      `select base_porcentaje from gmp.formulas_fabricacion where id = $1`,
      [vacia],
    );
    if (f.base_porcentaje !== 'VV') throw new Error(f.base_porcentaje);
  },
);
await rechaza(
  'y no se mezclan P/P con V/V',
  `with pp as (insert into gmp.formulas_fabricacion (producto_id, version) values ('${prod}', '10') returning id),
        c as (insert into gmp.formula_componentes (formula_id, orden, nombre_libre, porcentaje_pp) select id, 1, 'Agua', 10 from pp returning formula_id)
   select gmp.copiar_componentes('${formula}', (select formula_id from c))`,
  /no se pegan juntas/,
);
await invariantes();
fin();
