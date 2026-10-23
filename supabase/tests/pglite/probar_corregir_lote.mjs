// Corregir la cantidad de un lote mal cargado, antes y después de entrar a
// stock (20261022200000, D-ajustes-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como('silveira@x');
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov L') returning id`)
).id;
await como('silveira@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-L1', 'Frasco L', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const r = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'RL', true) returning id`,
    [prov],
  )
).id;
const lote = (
  await uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, 1, 100, 'UNIDAD', true) returning id`,
    [r, ins],
  )
).id;
const corregir = (bultos, unidades, motivo = 'Se contó mal') =>
  q(
    `insert into comercial.correcciones_lote (lote_insumo_id, bultos_despues, unidades_despues, motivo) values ($1, $2, $3, $4)`,
    [lote, bultos, unidades, motivo],
  );
const saldo = async () =>
  Number(
    (
      await uno(
        `select coalesce(sum(cantidad), 0) s from comercial.movimientos_stock where lote_insumo_id = $1`,
        [lote],
      )
    ).s,
  );

await rechaza(
  'Recepción no corrige',
  `insert into comercial.correcciones_lote (lote_insumo_id, bultos_despues, unidades_despues, motivo) values ('${lote}', 1, 90, 'mal')`,
  /Dirección Técnica o Gerencia/,
);

await como(DT);
await rechaza(
  'la cantidad sigue sin editarse directo',
  `update gmp.lotes_insumo set cantidad_unidades = 99 where id = '${lote}'`,
  /Corregir cantidad/,
);
await rechaza(
  'igual a la cargada',
  `insert into comercial.correcciones_lote (lote_insumo_id, bultos_despues, unidades_despues, motivo) values ('${lote}', 1, 100, 'nada')`,
  /nada que corregir/,
);

await prueba(
  'antes de stock: corrige el lote, sin movimiento, con el valor anterior',
  async () => {
    await corregir(2, 80);
    const l = await uno(
      `select cantidad_bultos b, cantidad_unidades u from gmp.lotes_insumo where id = $1`,
      [lote],
    );
    if (l.b !== 2 || Number(l.u) !== 80) throw new Error(JSON.stringify(l));
    const c = await uno(
      `select bultos_antes, unidades_antes from comercial.correcciones_lote where lote_insumo_id = $1`,
      [lote],
    );
    if (c.bultos_antes !== 1 || Number(c.unidades_antes) !== 100)
      throw new Error(JSON.stringify(c));
    if ((await saldo()) !== 0) throw new Error('movió stock');
    const a = await uno(
      `select count(*) n from core.auditoria where registro_id = $1 and datos_antes->>'cantidad_unidades' = '100.000'`,
      [lote],
    );
    if (Number(a.n) !== 1) throw new Error('sin auditoría del lote');
  },
);
await prueba('se carga a stock con la cantidad corregida', async () => {
  await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [r]);
  if ((await saldo()) !== 80) throw new Error(String(await saldo()));
});
await prueba('ya en stock: de más entra un ajuste por la diferencia', async () => {
  await corregir(2, 120);
  const m = await uno(
    `select tipo, cantidad, motivo_tipo, documento_tipo from comercial.movimientos_stock where lote_insumo_id = $1 and tipo = 'ENTRADA_AJUSTE'`,
    [lote],
  );
  if (
    Number(m.cantidad) !== 40 ||
    m.motivo_tipo !== 'ERROR_DE_REGISTRO' ||
    m.documento_tipo !== 'CORRECCION_LOTE'
  )
    throw new Error(JSON.stringify(m));
  if ((await saldo()) !== 120) throw new Error(String(await saldo()));
});
await prueba('y de menos sale', async () => {
  await corregir(2, 50);
  if ((await saldo()) !== 50) throw new Error(String(await saldo()));
});
await rechaza(
  'sin motivo no',
  `insert into comercial.correcciones_lote (lote_insumo_id, bultos_despues, unidades_despues, motivo) values ('${lote}', 1, 40, '')`,
  /check/,
);
await rechaza(
  'append-only',
  `update comercial.correcciones_lote set motivo = 'otro'`,
  /permission|denied|permiso/i,
);

// 20261022200300 (D-ajustes-4): un ajuste manual sin motivo escrito no entra.
await rechaza(
  'ajuste de stock sin motivo',
  `insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo_tipo)
   select articulo_id, lote_insumo_id, deposito_id, 'ENTRADA_AJUSTE', 1, 'DIFERENCIA_DE_INVENTARIO'
     from comercial.movimientos_stock where lote_insumo_id = '${lote}' limit 1`,
  /manuales_con_motivo/,
);

await invariantes();
fin();
