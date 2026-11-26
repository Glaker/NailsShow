// Descontar un insumo con un lote en otra unidad que la ficha
// (20261126120000): caso 138CL1, ficha en L, lote contado en g y lote en L.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('agus@x', 'ADMINISTRACION');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como(DT);
const prod = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('SAN9', 'Sanitizante', 24) returning id`,
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
    await q(`update gmp.insumos_catalogo set densidad_referencia_id = $1 where id = $2`, [d, id]);
  }
  return id;
};
const alc = await insumo('ALC9', 'l', 0.8);
const formula = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version, base_porcentaje) values ($1, '01', 'VV') returning id`,
    [prod],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, 1, $2, 100)`,
  [formula, alc],
);

await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov U') returning id`)
).id;
await como('naza@x');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-U', true) returning id`,
    [prov],
  )
).id;
const lote = async (cant, unidad, vence) =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados, plazo_validez)
       values ($1, $2, 'L', 1, $3, $4, true, $5) returning id`,
      [rec, alc, cant, unidad, vence],
    )
  ).id;
// 800 g = 1 L con densidad 0,8; vence antes, así que sale primero.
const enG = await lote(800, 'g', '2027-01-01');
const enL = await lote(2, 'l', '2028-01-01');
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [[enG, enL]]);
await db.exec('set session_replication_role = origin');
const saldo = async (l) =>
  N(
    (
      await uno(
        `select coalesce(sum(saldo), 0) s from comercial.v_saldos_stock where lote_insumo_id = $1`,
        [l],
      )
    ).s,
  );
const orden = async (partida, litros) => {
  await como('naza@x');
  const o = (
    await uno(
      `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, unidad)
       values ($1, $2, current_date, $3, $4, 'L') returning id`,
      [formula, prod, partida, litros],
    )
  ).id;
  await como('op@x');
  await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`, [o]);
  await como('naza@x');
  return o;
};

const o1 = await orden(1, 0.1);
await prueba('0,1 L salen del lote en g como 80 g', async () => {
  await q(`select comercial.terminar_orden($1, 0.1, 1)`, [o1]);
  if ((await saldo(enG)) !== 720 || (await saldo(enL)) !== 2)
    throw new Error(`${await saldo(enG)} g / ${await saldo(enL)} L`);
});
const o2 = await orden(2, 1.5);
await prueba('1,5 L: se termina el lote en g (720 g = 0,9 L) y 0,6 L del lote en L', async () => {
  await q(`select comercial.terminar_orden($1, 1.5, 1)`, [o2]);
  if ((await saldo(enG)) !== 0 || Math.abs((await saldo(enL)) - 1.4) > 1e-4)
    throw new Error(`${await saldo(enG)} g / ${await saldo(enL)} L`);
});
await prueba('faltantes: «hay» suma en la unidad de la ficha', async () => {
  const r = await uno(
    `select disponible from comercial.faltantes_tanda($1, $2::jsonb) where codigo = 'ALC9'`,
    [await orden(3, 1), JSON.stringify([{ producto_id: prod, unidades: 1 }])],
  );
  if (Math.abs(N(r?.disponible) - 1.4) > 1e-4) throw new Error(JSON.stringify(r));
});

// Sin densidad, de masa a volumen no se supone: avisa.
await como(DT);
const sinD = await insumo('ALC8', 'l', null);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.insumos_catalogo set densidad_referencia_id = null where id = $1`, [sinD]);
await db.exec('set session_replication_role = origin');
await q(`update gmp.formula_componentes set insumo_id = $1 where formula_id = $2`, [sinD, formula]);
await como('naza@x');
const rec2 = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-U2', true) returning id`,
    [prov],
  )
).id;
const lg = (
  await uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, 'L', 1, 500, 'g', true) returning id`,
    [rec2, sinD],
  )
).id;
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec2]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = $1`, [lg]);
await db.exec('set session_replication_role = origin');
const o4 = await orden(4, 0.1);
await rechaza(
  'lote en g, ficha en L y sin densidad: pide la densidad',
  `select comercial.terminar_orden('${o4}', 0.1, 1)`,
  /hace falta la densidad/,
);

// El aviso de stock de producto terminado dice qué producto y dónde.
await como('agus@x');
await rechaza(
  'no alcanza el stock: nombra el producto y el depósito',
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo)
   select '${prod}', id, 'SALIDA_AJUSTE', -50, 'prueba' from gmp.depositos where numero = 'PTF'`,
  /SAN9 Sanitizante.*Producto terminado/,
);

await invariantes();
fin();
