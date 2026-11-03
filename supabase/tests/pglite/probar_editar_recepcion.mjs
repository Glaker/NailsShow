// Editar una recepción antes de cargarla a stock (20261103130000, D-recepcion-5).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
await usuario('ventas@x', 'VENTAS');

await como('silveira@x');
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov A') returning id`)
).id;
const prov2 = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov B') returning id`)
).id;
await como('silveira@x');
const insumo = async (c, n) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ($1, $2, 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
      [c, n],
    )
  ).id;
const frasco = await insumo('ENV-R1', 'Frasco R1');
const tapa = await insumo('ENV-R2', 'Tapa R2');
const r = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-1', true) returning id`,
    [prov],
  )
).id;
const lote = async (ins, cant) =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
       values ($1, $2, 'LP-1', 1, $3, 'UNIDAD', true) returning id`,
      [r, ins, cant],
    )
  ).id;
const l1 = await lote(frasco, 100);
const l2 = await lote(frasco, 50);
await q(`select gmp.emitir_rotulo_lote_insumo($1, 'CUARENTENA')`, [l1]);
const fila = (id) => uno(`select * from gmp.lotes_insumo where id = $1`, [id]);

await rechaza(
  'por UPDATE directo sigue sin editarse',
  `update gmp.lotes_insumo set cantidad_unidades = 1 where id = '${l1}'`,
  /Recepciones/,
);
await prueba(
  'Silveira corrige remito, proveedor, insumo, cantidad y lote del proveedor',
  async () => {
    await q(`select comercial.editar_recepcion($1, $2, $3)`, [
      r,
      JSON.stringify({ numero_remito: 'R-1B', proveedor_id: prov2 }),
      JSON.stringify([
        { id: l1, insumo_id: tapa, cantidad_unidades: 120, lote_proveedor: 'LP-9' },
      ]),
    ]);
    const l = await fila(l1);
    const rec = await uno(`select * from gmp.recepciones where id = $1`, [r]);
    if (
      l.insumo_id !== tapa ||
      Number(l.cantidad_unidades) !== 120 ||
      l.lote_proveedor !== 'LP-9'
    )
      throw new Error(JSON.stringify(l));
    if (rec.numero_remito !== 'R-1B' || rec.proveedor_id !== prov2)
      throw new Error(JSON.stringify(rec));
  },
);
await prueba('el rótulo vigente se reemite con los datos nuevos', async () => {
  const rs = await q(
    `select vigente, contenido, reemplazado_por from gmp.rotulos where entidad_id = $1 order by emitido_en, vigente`,
    [l1],
  );
  const v = rs.filter((x) => x.vigente);
  if (rs.length !== 2 || v.length !== 1) throw new Error(JSON.stringify(rs));
  if (
    v[0].contenido.lote_proveedor !== 'LP-9' ||
    v[0].contenido.proveedor !== 'Prov B' ||
    v[0].contenido.nombre !== 'Tapa R2'
  )
    throw new Error(JSON.stringify(v[0]));
});
await prueba('queda en auditoría con el valor anterior', async () => {
  await db.exec('reset role');
  const a = await q(
    `select 1 from core.auditoria where tabla = 'lotes_insumo' and registro_id = $1 and (datos_antes->>'cantidad_unidades')::numeric = 100`,
    [l1],
  );
  await como('silveira@x');
  if (!a.length) throw new Error('sin auditoría');
});
await como('ventas@x');
await rechaza(
  'Ventas no edita recepciones',
  `select comercial.editar_recepcion('${r}', '{}'::jsonb, '[]'::jsonb)`,
  /Recepción, Gerencia de Producción o Dirección Técnica/,
);
await como('silveira@x');
await prueba('agrega un lote que faltó', async () => {
  await lote(tapa, 10);
});
await prueba('quita el lote que sobró y ya no se ve', async () => {
  await q(`insert into gmp.lotes_quitados (lote_insumo_id) values ($1)`, [l2]);
  const v = await q(`select id from gmp.lotes_insumo where id = $1`, [l2]);
  if (v.length) throw new Error('se sigue viendo');
});
await prueba('al cargar a stock, el quitado no entra', async () => {
  const m = await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [r]);
  if (m.length !== 2 || m.some((x) => x.lote_insumo_id === l2))
    throw new Error(JSON.stringify(m));
});
await rechaza(
  'cargada a stock ya no se edita',
  `select comercial.editar_recepcion('${r}', '{"numero_remito":"X"}'::jsonb, '[]'::jsonb)`,
  /ya se cargó a stock/,
);
await rechaza(
  'ni se le agregan lotes',
  `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad)
   values ('${r}', '${tapa}', 'LP', 1, 1, 'UNIDAD')`,
  /no se le agregan lotes/,
);

await invariantes();
fin();
