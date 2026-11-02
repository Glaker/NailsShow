// Liberar antes de terminar el envasado (20261102120000, D-liberar-antes-1):
// DT libera una orden abierta con todo controlado y Naza sigue cargando
// tandas, que entran ya liberadas. DT no carga ni termina.
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


const estado = () =>
  uno(
    `select estado, terminada_en, unidades_obtenidas, cantidad_obtenida from gmp.ordenes_produccion where id=$1`,
    [o],
  );
const impedimento = async () =>
  (await uno(`select gmp.impedimento_despacho_orden($1) i`, [o])).i;

await como(DT);
await rechaza(
  'abierta y con etapas sin registrar, no se libera',
  `select gmp.liberar_orden('${o}', true)`,
  /Todavía no se puede liberar/,
);

// Todas las etapas registradas y controladas, granel y producto terminado aprobados.
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into gmp.op_etapas (orden_id, etapa, datos, realizo_por, realizo_en, controlo_por, controlo_en)
   select $1, e, case when e::text in ('CC_GRANEL','CC_PT') then '{"aprobado": true}'::jsonb else '{}'::jsonb end,
          u.id, now(), u.id, now()
     from unnest(enum_range(null::gmp.etapa_orden_enum)) e, core.usuarios u
    where u.email = $2
   on conflict do nothing`,
  [o, DT],
);
await q(
  `update gmp.op_etapas set controlo_por = (select id from core.usuarios where email=$2), controlo_en = now()
    where orden_id = $1 and controlo_por is null`,
  [o, DT],
);
await db.exec('set session_replication_role = origin');

await como('naza@x');
await prueba('día 1 antes de liberar: entra retenido', async () => {
  await q(tanda([{ producto_id: rem, unidades: 200 }]));
  if ((await enPtf(rem)) !== 200) throw new Error('stock');
  if (!(await impedimento())) throw new Error('debería estar retenido');
});
await rechaza(
  'Gerencia de Producción no libera',
  `select gmp.liberar_orden('${o}', true)`,
  /Dirección Técnica/,
);

await como(DT);
await prueba('DT libera la orden abierta', async () => {
  await q(`select gmp.liberar_orden($1, true)`, [o]);
  const r = await estado();
  if (r.estado !== 'LIBERADA' || r.terminada_en) throw new Error(JSON.stringify(r));
  if (await impedimento()) throw new Error('sigue retenido: ' + (await impedimento()));
});
await rechaza(
  'DT no carga lo que salió',
  tanda([{ producto_id: rem, unidades: 10 }]),
  /Gerencia de Producción/,
);

await como('naza@x');
await prueba('día 2 ya liberada: entra al stock y descuenta envase y etiqueta', async () => {
  await q(tanda([{ producto_id: rem, unidades: 300 }]));
  if ((await enPtf(rem)) !== 500) throw new Error('stock ' + (await enPtf(rem)));
  if ((await saldo(env200)) !== 500 || (await saldo(etq)) !== 1500)
    throw new Error('envase/etiqueta');
});
await rechaza(
  'la orden liberada no se edita por fuera del cierre',
  `update gmp.ordenes_produccion set cantidad_obtenida = 1 where id = '${o}'`,
  /no se modifica/,
);
await prueba('cerrar el envasado deja lo obtenido y sigue liberada', async () => {
  await q(tanda([], ", 'fin', true, 1.9"));
  const r = await estado();
  if (
    r.estado !== 'LIBERADA' ||
    !r.terminada_en ||
    N(r.unidades_obtenidas) !== 500 ||
    N(r.cantidad_obtenida) !== 1.9
  )
    throw new Error(JSON.stringify(r));
});
await rechaza(
  'cerrado el envasado, no se cargan más',
  tanda([{ producto_id: rem, unidades: 1 }]),
  /envasado cerrado/,
);

await invariantes();
fin();
