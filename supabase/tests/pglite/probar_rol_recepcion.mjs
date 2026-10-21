// Rol RECEPCION y control rápido de materia prima (20261020140000/140100).
import { banco } from './lib.mjs';
const { db, uno, q, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
await usuario('gp@x', 'GERENCIA_PRODUCCION');

await como('silveira@x');
let mp, envase, rec, loteMp, loteEnv, loteMp2;
await prueba('da de alta insumos', async () => {
  mp = (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ('MP-R1', 'Aceite R', 'MATERIA_PRIMA', 'g', true) returning id`,
    )
  ).id;
  envase = (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ('ENV-R1', 'Frasco R', 'MATERIAL_ENVASE', 'UNIDAD', false) returning id`,
    )
  ).id;
});
await prueba('pero no edita una ficha (la política no le deja la fila)', async () => {
  const tocadas = await q(
    `update gmp.insumos_catalogo set nombre = 'otro' where codigo_interno = 'MP-R1' returning id`,
  );
  if (tocadas.length !== 0) throw new Error('editó la ficha');
});
await prueba('registra la recepción y sus lotes, rotulados en cuarentena', async () => {
  const prov = (
    await (async () => {
      await db.exec('reset role');
      return uno(
        `insert into gmp.proveedores (razon_social) values ('Prov R') returning id`,
      );
    })()
  ).id;
  await como('silveira@x');
  rec = (
    await uno(
      `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-1', true) returning id`,
      [prov],
    )
  ).id;
  const lote = async (ins, unidad) =>
    (
      await uno(
        `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados, protocolo_recibido)
         values ($1, $2, 'L', 1, 100, $3, true, true) returning id`,
        [rec, ins, unidad],
      )
    ).id;
  loteMp = await lote(mp, 'g');
  loteEnv = await lote(envase, 'UNIDAD');
  loteMp2 = await lote(mp, 'g');
  await q(`select gmp.emitir_rotulo_lote_insumo($1, 'CUARENTENA')`, [loteMp]);
  await q(`select gmp.emitir_rotulo_lote_insumo($1, 'CUARENTENA')`, [loteEnv]);
});
await rechaza(
  'no crea un lote que nace aprobado',
  `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados, protocolo_recibido, estado)
   values ('${rec}', '${mp}', 'L', 1, 1, 'g', true, true, 'APROBADO')`,
  /row-level security|política|policy/i,
);
await rechaza(
  'ni cambia datos de la recepción (solo la marca de carga)',
  `update gmp.recepciones set observaciones = 'x' where id = '${rec}'`,
  /solo marca/,
);
await prueba('la carga a stock', async () => {
  const m = await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
  if (m.length !== 3) throw new Error(String(m.length));
  const r = await uno(`select cargado_a_stock from gmp.recepciones where id = $1`, [rec]);
  if (!r.cargado_a_stock) throw new Error('la recepción no quedó marcada');
});
await rechaza(
  'pero no asienta una salida de stock',
  `insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo)
   select m.articulo_id, m.lote_insumo_id, m.deposito_id, 'SALIDA_DESCARTE', 1, 'x'
     from comercial.movimientos_stock m where m.lote_insumo_id = '${loteEnv}' limit 1`,
  /row-level security|policy/i,
);
await prueba('aprueba una materia prima con el control rápido', async () => {
  const r = await uno(
    `select * from gmp.control_rapido_materia_prima($1, true, true, true, true, true, true, 1, 'Transparente, sin partículas')`,
    [loteMp],
  );
  if (r.registro !== 'R.50.5.1' || !r.aprobado) throw new Error(JSON.stringify(r));
  const l = await uno(`select estado from gmp.lotes_insumo where id = $1`, [loteMp]);
  if (l.estado !== 'APROBADO') throw new Error(l.estado);
  const m = await uno(
    `select count(*)::int n from gmp.muestreos where entidad_tipo = 'lote_insumo' and entidad_id = $1`,
    [loteMp],
  );
  if (m.n !== 1) throw new Error('sin muestreo');
  const v = await uno(
    `select estado from gmp.rotulos where entidad_tipo = 'lote_insumo' and entidad_id = $1 and vigente`,
    [loteMp],
  );
  if (v.estado !== 'APROBADO') throw new Error(v.estado);
});
await rechaza(
  'con olor no conforme no aprueba',
  `select gmp.control_rapido_materia_prima('${loteMp2}', true, true, true, true, false, true, 1)`,
  /no se aprueba/,
);
await prueba(
  'pero rechaza, y el lote recién recibido pasa antes por cuarentena',
  async () => {
    await q(
      `select gmp.control_rapido_materia_prima($1, true, true, true, true, false, false, 1, 'Olor rancio')`,
      [loteMp2],
    );
    const l = await uno(`select estado from gmp.lotes_insumo where id = $1`, [loteMp2]);
    if (l.estado !== 'RECHAZADO') throw new Error(l.estado);
  },
);
await rechaza(
  'el control rápido no es para envases',
  `select gmp.control_rapido_materia_prima('${loteEnv}', true, true, true, true, true, true, 1)`,
  /solo para materia prima/,
);
await rechaza(
  'ni puede muestrear un envase por el circuito largo',
  `select gmp.registrar_muestreo('${loteEnv}', 5, 'UNIDAD', 'Recepción', true, true, true, 1, 'REUTILIZACION_ENVASE')`,
  /./,
);
await rechaza(
  'ni ve nada que no sea suyo: no puede dictaminar granel',
  `insert into gmp.registros_analisis (orden_id, tamano_muestra, descripcion, conclusiones, aprobado, fecha)
   values (gen_random_uuid(), 'x', 'x', 'x', true, current_date)`,
  /./,
);
await prueba('todo quedó a su nombre', async () => {
  await db.exec('reset role');
  const r = await uno(
    `select u.email from gmp.registros_analisis a join core.usuarios u on u.id = a.controlo_por
      where a.lote_insumo_id = $1`,
    [loteMp],
  );
  if (r.email !== 'silveira@x') throw new Error(r.email);
});
await invariantes();
fin();
