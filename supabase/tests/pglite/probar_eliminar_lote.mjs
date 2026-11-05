// Eliminar un lote de insumo: solo DT, con motivo, si no se usó
// (20261105150000, D-eliminar-lote-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
await usuario('gp@x', 'GERENCIA_PRODUCCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como('silveira@x');
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov E') returning id`)
).id;
await como('silveira@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-E1', 'Frasco E', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const r = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'RE', true) returning id`,
    [prov],
  )
).id;
const nuevoLote = async (u) =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
       values ($1, $2, 1, $3, 'UNIDAD', true) returning id`,
      [r, ins, u],
    )
  ).id;
const lote = await nuevoLote(100);
const usado = await nuevoLote(50);
await como(DT);
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [r]);
// Una muestra sacada del segundo: ese lote ya se usó.
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, unidad, motivo, motivo_tipo)
   select articulo_id, lote_insumo_id, deposito_id, 'SALIDA_MUESTRA', -1, unidad, 'Muestra', 'MUESTRA_DE_ARCHIVO'
     from comercial.v_saldos_stock where lote_insumo_id = $1`,
  [usado],
);
await db.exec('set session_replication_role = origin');

const eliminar = (id, motivo = 'Cargado dos veces') =>
  `insert into comercial.lotes_eliminados (lote_insumo_id, motivo) values ('${id}', '${motivo}')`;

await como('gp@x');
await rechaza(
  'Gerencia de Producción no elimina',
  eliminar(lote),
  /row-level security|Dirección Técnica/,
);
await como(DT);
await rechaza('sin motivo no', eliminar(lote, ''), /check/);
await rechaza('un lote usado no se elimina', eliminar(usado), /ya se usó/);

await prueba(
  'la DT lo elimina: saldo a cero con ajuste y el lote desaparece',
  async () => {
    await q(eliminar(lote));
    const m = await uno(
      `select cantidad, motivo_tipo, documento_tipo from comercial.movimientos_stock
      where lote_insumo_id = $1 and tipo = 'SALIDA_AJUSTE'`,
      [lote],
    );
    if (
      Number(m.cantidad) !== -100 ||
      m.motivo_tipo !== 'ERROR_DE_REGISTRO' ||
      m.documento_tipo !== 'ELIMINACION_LOTE'
    )
      throw new Error(JSON.stringify(m));
    const s = await uno(
      `select coalesce(sum(cantidad), 0) s from comercial.movimientos_stock where lote_insumo_id = $1`,
      [lote],
    );
    if (Number(s.s) !== 0) throw new Error('saldo ' + s.s);
    const v = await uno(`select count(*)::int n from gmp.lotes_insumo where id = $1`, [
      lote,
    ]);
    if (v.n !== 0) throw new Error('se sigue viendo');
    const e = await uno(
      `select u.email from comercial.lotes_eliminados e join core.usuarios u on u.id = e.eliminado_por where e.lote_insumo_id = $1`,
      [lote],
    );
    if (e.email !== DT) throw new Error(JSON.stringify(e));
  },
);
await rechaza(
  'append-only',
  `update comercial.lotes_eliminados set motivo = 'otro'`,
  /permission|denied/i,
);
await rechaza(
  'quitar un lote de una recepción cargada sigue rechazado fuera de la eliminación',
  `insert into gmp.lotes_quitados (lote_insumo_id) values ('${usado}')`,
  /ya se cargó a stock/,
);
await prueba('queda auditado', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria where tabla = 'lotes_eliminados'`,
  );
  if (a.n !== 1) throw new Error(`auditoría ${a.n}`);
});
await invariantes();
fin();
