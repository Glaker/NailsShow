// Corregir remito, proveedor, lote del proveedor y plazo de validez de un lote,
// con motivo (20261026140000, D-corregir-datos-lote-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('silveira@x', 'RECEPCION');

await como('naza@x');
const prov = async (n) =>
  (await uno(`insert into gmp.proveedores (razon_social) values ($1) returning id`, [n]))
    .id;
const provA = await prov('Prov A');
const provB = await prov('Prov B');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('MP-C1', 'Crema', 'MATERIA_PRIMA', 'g') returning id`,
  )
).id;
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, '0001-0001', true) returning id`,
    [provA],
  )
).id;
const lote = (
  await uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, plazo_validez, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, 'L-1', '2027-01-31', 1, 1000, 'g', true) returning id`,
    [rec, ins],
  )
).id;
const corregir = (campo, valor, motivo = 'ERROR_TIPEO', detalle = null) =>
  uno(
    `insert into comercial.correcciones_dato_lote (lote_insumo_id, campo, valor_despues, motivo, motivo_detalle)
     values ($1, $2, $3, $4, $5) returning *`,
    [lote, campo, valor, motivo, detalle],
  );
const ins_sql = (campo, valor, motivo = 'ERROR_TIPEO', detalle = 'null') =>
  `insert into comercial.correcciones_dato_lote (lote_insumo_id, campo, valor_despues, motivo, motivo_detalle)
   values ('${lote}', '${campo}', ${valor === null ? 'null' : `'${valor}'`}, '${motivo}', ${detalle})`;
const elLote = () =>
  uno(
    `select l.lote_proveedor, l.plazo_validez::text pv, r.numero_remito, r.proveedor_id
       from gmp.lotes_insumo l join gmp.recepciones r on r.id = l.recepcion_id where l.id = $1`,
    [lote],
  );

await rechaza(
  'directo sigue sin editarse',
  `update gmp.lotes_insumo set lote_proveedor = 'X' where id = '${lote}'`,
  /Corregir cantidad/,
);
await prueba('el lote del proveedor, por error de tipeo, con el anterior', async () => {
  const c = await corregir('lote_proveedor', ' L-2 ');
  if (c.valor_antes !== 'L-1' || c.valor_despues !== 'L-2')
    throw new Error(JSON.stringify(c));
  if ((await elLote()).lote_proveedor !== 'L-2') throw new Error('no cambió');
});
await prueba('el plazo de validez, por error del proveedor', async () => {
  const c = await corregir('plazo_validez', '2027-06-30', 'ERROR_PROVEEDOR');
  if (c.valor_antes !== '2027-01-31') throw new Error(c.valor_antes);
  if ((await elLote()).pv !== '2027-06-30') throw new Error('no cambió');
});
await rechaza(
  'una fecha que no es fecha',
  ins_sql('plazo_validez', '31/13/2027'),
  /no es válida/,
);
await rechaza(
  '«otro» sin detalle',
  ins_sql('numero_remito', '0001-0002', 'OTRO'),
  /otro_con_detalle/,
);
await prueba('el remito, por otro motivo con detalle', async () => {
  const c = await corregir(
    'numero_remito',
    '0001-0002',
    'OTRO',
    'El proveedor mandó otro remito',
  );
  if (c.valor_antes !== '0001-0001') throw new Error(c.valor_antes);
  if ((await elLote()).numero_remito !== '0001-0002') throw new Error('no cambió');
});
await rechaza(
  'igual al cargado',
  ins_sql('numero_remito', '0001-0002'),
  /nada que corregir/,
);
await rechaza('un motivo inventado', ins_sql('numero_remito', '9', 'PORQUE_SI'), /check/);
await prueba('el proveedor de la recepción', async () => {
  await corregir('proveedor', provB);
  if ((await elLote()).proveedor_id !== provB) throw new Error('no cambió');
});
await q(
  `insert into comercial.comprobantes_proveedor (proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total)
   values ($1, $2, 'FACTURA_A', 1, 55, 100, 21, 121)`,
  [provB, rec],
);
await rechaza(
  'con comprobante vigente del proveedor, no se cambia',
  ins_sql('proveedor', provA),
  /comprobante de proveedor vigente/,
);
await prueba(
  'el lote del proveedor se puede vaciar: la recepción tiene remito',
  async () => {
    await corregir('lote_proveedor', '');
  },
);
await rechaza(
  'y entonces el remito ya no se vacía',
  ins_sql('numero_remito', ''),
  /no se puede dejar vacío/,
);
await como('silveira@x');
await rechaza(
  'Recepción no corrige',
  ins_sql('lote_proveedor', 'L-9'),
  /Dirección Técnica o Gerencia/,
);

await prueba('cada corrección queda auditada a nombre de Naza', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.tabla = 'correcciones_dato_lote' and u.email = 'naza@x'`,
  );
  if (a.n !== 5) throw new Error(`${a.n} filas`);
});
await invariantes();
fin();
