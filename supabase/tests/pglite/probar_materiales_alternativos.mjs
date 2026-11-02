// Materiales «o» (20261102150000, D-materiales-o-1): la carga usa la primera
// opción con stock y completa con la siguiente; lo que planifica, la primera.
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


// Opción 2 del envase de 200 ml: envase B + pico B, con 1000 de cada uno.
await como('naza@x');
const envB = await insumo('ENVB', 'MATERIAL_ENVASE', 'UNIDAD');
const picoB = await insumo('PICOB', 'MATERIAL_ENVASE', 'UNIDAD');
for (const i of [envB, picoB])
  await q(
    `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol, alternativa_grupo, alternativa_opcion)
     values ($1,$2,1,'ENVASE','Envase',2)`,
    [rem, i],
  );
await q(
  `update gmp.materiales_acondicionamiento set alternativa_grupo='Envase', alternativa_opcion=1
    where producto_id=$1 and insumo_id=$2 and activo`,
  [rem, env200],
);
const rec2 = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-B', true) returning id`,
    [prov],
  )
).id;
const lotesB = [];
for (const i of [envB, picoB])
  lotesB.push(
    (
      await uno(
        `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
         values ($1, $2, 'L', 1, 1000, 'UNIDAD', true) returning id`,
        [rec2, i],
      )
    ).id,
  );
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec2]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [lotesB]);
await db.exec('set session_replication_role = origin');

await rechaza(
  'el grupo pide opción y nombre juntos',
  `update gmp.materiales_acondicionamiento set alternativa_opcion = 3, alternativa_grupo = null where insumo_id = '${envB}'`,
  /materiales_alternativa_completa/,
);

await como('naza@x');
await prueba('faltantes: 1500 entran con 1000 de la opción 1 y 500 de la 2, sin faltar nada', async () => {
  const f = Object.fromEntries(
    (await q(`select * from comercial.faltantes_tanda($1, $2::jsonb)`, [o, JSON.stringify([{ producto_id: rem, unidades: 1500 }])])).map(
      (x) => [x.codigo, x],
    ),
  );
  if (N(f.ENV200?.necesita) !== 1000 || N(f.ENVB?.necesita) !== 500 || N(f.PICOB?.necesita) !== 500)
    throw new Error(JSON.stringify(f));
  if (Object.values(f).some((x) => N(x.falta) > 0 && x.codigo !== 'BASE')) throw new Error('falta algo');
});
await prueba('la carga descuenta igual: opción 1 hasta agotar, el resto de la 2', async () => {
  await q(tanda([{ producto_id: rem, unidades: 1500 }]));
  if ((await saldo(env200)) !== 0 || (await saldo(envB)) !== 500 || (await saldo(picoB)) !== 500)
    throw new Error(`${await saldo(env200)} ${await saldo(envB)} ${await saldo(picoB)}`);
});
await prueba('sin stock en ninguna opción, falta la primera y el aviso nombra la otra', async () => {
  const f = await q(`select * from comercial.faltantes_tanda($1, $2::jsonb)`, [
    o,
    JSON.stringify([{ producto_id: rem, unidades: 900 }]),
  ]);
  const env = f.find((x) => x.codigo === 'ENV200');
  if (N(env?.falta) !== 400 || !/ENVB \+ PICOB/.test(env?.nota ?? '')) throw new Error(JSON.stringify(f));
});
await rechaza(
  'y la carga real no carga nada (también se agota la etiqueta)',
  tanda([{ producto_id: rem, unidades: 900 }]),
  /No alcanza (ENV200|ETQ)/,
);
await prueba('la necesidad de un pedido cuenta solo la opción preferida', async () => {
  await db.exec('reset role');
  const ped = (
    await uno(`insert into comercial.pedidos (numero, cliente) values ('P-ALT','Cliente') returning id`)
  ).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,10)`, [ped, rem]);
  const n = await q(
    `select i.codigo_interno c from comercial.necesidad_pedido($1) x join gmp.insumos_catalogo i on i.id = x.insumo_id`,
    [ped],
  );
  const cods = n.map((x) => x.c);
  if (!cods.includes('ENV200') || cods.includes('ENVB') || cods.includes('PICOB')) throw new Error(JSON.stringify(cods));
});

await invariantes();
fin();
