// Completar casillas que quedaron sin tildar en un lote recibido
// (20261022180000, D-recepcion-4).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como('silveira@x');
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov C') returning id`)
).id;
await como('silveira@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-C1', 'Pipeta C', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const r = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'RC', true) returning id`,
    [prov],
  )
).id;
const lote = (
  await uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, 1, 100, 'UNIDAD', false) returning id`,
    [r, ins],
  )
).id;

await como(DT);
await rechaza(
  'sin la casilla no pasa a cuarentena',
  `select gmp.control_recepcion_envase('${lote}', true, true, true, true, true, null)`,
  /contenedores deben limpiarse/,
);
await rechaza(
  'lo demás de la recepción sigue sin editarse',
  `update gmp.lotes_insumo set cantidad_unidades = 99 where id = '${lote}'`,
  /no se edita/,
);
await prueba(
  'la casilla se completa, queda auditada, y el envase se controla',
  async () => {
    await q(`update gmp.lotes_insumo set contenedores_limpiados = true where id = $1`, [
      lote,
    ]);
    const a = await uno(
      `select count(*) n from core.auditoria where registro_id = $1 and datos_despues->>'contenedores_limpiados' = 'true' and datos_antes->>'contenedores_limpiados' = 'false'`,
      [lote],
    );
    if (Number(a.n) !== 1) throw new Error('sin auditoría: ' + JSON.stringify(a));
    await q(
      `select gmp.control_recepcion_envase($1, true, true, true, true, true, null)`,
      [lote],
    );
  },
);
await rechaza(
  'no se destilda',
  `update gmp.lotes_insumo set contenedores_limpiados = false where id = '${lote}'`,
  /solo se completan/,
);

await invariantes();
fin();
