// Estiba «A-N» del lote, optativa, desde «Cargar a stock» (20261026120000).
import { banco } from './lib.mjs';
const { db, uno, q, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await usuario('adm@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('ventas@x', 'VENTAS');

await como('gp@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
     values ('MP-E1', 'MP-E1', 'MATERIA_PRIMA', 'g', false) returning id`,
  )
).id;
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov E') returning id`)
).id;
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, '0001-1', true) returning id`,
    [prov],
  )
).id;
const lote = (
  await uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, 'L1', 1, 10, 'g', true) returning id`,
    [rec, ins],
  )
).id;
const estiba = async () =>
  (await uno(`select estiba from gmp.lotes_insumo where id=$1`, [lote])).estiba;

await prueba('sin estiba, el lote entra igual', async () => {
  if ((await estiba()) !== null) throw new Error('trae estiba');
});

await como('adm@x');
await prueba('Administración la pone, en mayúscula y sin espacios', async () => {
  await q(`select gmp.asignar_estiba_lote($1, ' b-12 ')`, [lote]);
  if ((await estiba()) !== 'B-12') throw new Error(await estiba());
});
for (const mala of ['B12', 'BB-1', '1-B', 'B-', 'B-1a'])
  await rechaza(
    `«${mala}» no es A-N`,
    `select gmp.asignar_estiba_lote('${lote}', '${mala}')`,
    /lotes_insumo_estiba_formato/,
  );
await prueba('se cambia si el lote se mueve, y vacía se borra', async () => {
  await q(`select gmp.asignar_estiba_lote($1, 'C-3')`, [lote]);
  if ((await estiba()) !== 'C-3') throw new Error(await estiba());
  await q(`select gmp.asignar_estiba_lote($1, '')`, [lote]);
  if ((await estiba()) !== null) throw new Error(await estiba());
});

await como('ventas@x');
await rechaza(
  'Ventas no la asigna',
  `select gmp.asignar_estiba_lote('${lote}', 'A-1')`,
  /no puede asignar la estiba/,
);

await prueba('queda auditada a nombre de quien la puso', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.tabla = 'lotes_insumo' and a.registro_id = $1 and u.email = 'adm@x'`,
    [lote],
  );
  if (a.n < 3) throw new Error(`solo ${a.n} filas`);
});
await invariantes();
fin();
