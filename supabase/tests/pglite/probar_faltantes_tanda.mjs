// Faltantes antes de cargar una tanda (20261102140000): la misma cuenta que
// comercial.registrar_tanda, todos los insumos de una vez y sin escribir nada.
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


const faltantes = (reparto) =>
  q(`select * from comercial.faltantes_tanda($1, $2::jsonb)`, [o, JSON.stringify(reparto)]);
const porCodigo = async (reparto) =>
  Object.fromEntries((await faltantes(reparto)).map((f) => [f.codigo, f]));
const movimientos = async () =>
  N((await uno(`select count(*) n from comercial.movimientos_stock`)).n);

await como('naza@x');
await prueba('1500 de 200 ml: falta el envase (500), la etiqueta alcanza', async () => {
  const f = await porCodigo([{ producto_id: rem, unidades: 1500 }]);
  if (N(f.ENV200?.necesita) !== 1500 || N(f.ENV200?.disponible) !== 1000 || N(f.ENV200?.falta) !== 500)
    throw new Error(JSON.stringify(f.ENV200));
  if (N(f.ETQ?.falta) !== 0 || N(f.ETQ?.necesita) !== 1500) throw new Error(JSON.stringify(f.ETQ));
});
await prueba('la materia prima del granel entra con la primera tanda', async () => {
  const f = await porCodigo([{ producto_id: rem, unidades: 10 }]);
  if (!f.BASE || N(f.BASE.necesita) <= 0) throw new Error(JSON.stringify(f));
});
await prueba('preguntar no escribe nada', async () => {
  const antes = await movimientos();
  await faltantes([{ producto_id: rem, unidades: 1500 }]);
  if ((await movimientos()) !== antes) throw new Error('escribió');
});
await rechaza(
  'y la carga real rechaza lo mismo que la función marca',
  tanda([{ producto_id: rem, unidades: 1500 }]),
  /No alcanza ENV200/,
);
await prueba('con una tanda ya cargada, la materia prima no se vuelve a pedir', async () => {
  await q(tanda([{ producto_id: rem, unidades: 200 }]));
  const f = await porCodigo([{ producto_id: rem, unidades: 10 }]);
  if (f.BASE) throw new Error(JSON.stringify(f.BASE));
});
await prueba('sin unidades no pide nada', async () => {
  if ((await faltantes([])).length !== 0) throw new Error('pidió');
});

await invariantes();
fin();
