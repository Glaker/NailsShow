// Depósito por defecto, asignación desde «Cargar a stock» y lote del proveedor
// optativo con remito (20261020130000).
import { banco } from './lib.mjs';
const { db, uno, q, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await usuario('adm@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('ventas@x', 'VENTAS');

await como('gp@x');
const dep = async (numero) =>
  (await uno(`select id from gmp.depositos where numero=$1`, [numero])).id;
const insumo = async (codigo, tipo, inflamable = false) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo, es_inflamable)
       values ($1, $1, $2, $3, false, $4) returning id`,
      [codigo, tipo, tipo === 'MATERIA_PRIMA' ? 'g' : 'UNIDAD', inflamable],
    )
  ).id;
const prov = (
  await uno(
    `insert into gmp.proveedores (razon_social) values ('Prov Test') returning id`,
  )
).id;
const recepcion = async (remito) =>
  (
    await uno(
      `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, $2, true) returning id`,
      [prov, remito],
    )
  ).id;
const lote = async (rec, ins, loteProv = 'L1') =>
  uno(
    `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
     values ($1, $2, $3, 1, 10, 'UNIDAD', true) returning id, deposito_actual_id`,
    [rec, ins, loteProv],
  );

const conRemito = await recepcion('0001-00000001');
const sinRemito = await recepcion(null);
const frasco = await insumo('ENV-X1', 'MATERIAL_ENVASE');
const mp = await insumo('MP-X1', 'MATERIA_PRIMA');
const solvente = await insumo('MP-X2', 'MATERIA_PRIMA', true);

await prueba('un envase sin depósito en la ficha entra al 01', async () => {
  const l = await lote(conRemito, frasco);
  if (l.deposito_actual_id !== (await dep('01'))) throw new Error(l.deposito_actual_id);
});
await prueba('una materia prima, al 04', async () => {
  const l = await lote(conRemito, mp);
  if (l.deposito_actual_id !== (await dep('04'))) throw new Error(l.deposito_actual_id);
});
await prueba('un inflamable, al exterior aunque la ficha diga otro (RN-48)', async () => {
  await db.query(
    `update gmp.insumos_catalogo set deposito_cuarentena_id=$1 where id=$2`,
    [await dep('04'), solvente],
  );
  const l = await lote(conRemito, solvente);
  if (l.deposito_actual_id !== (await dep('INF'))) throw new Error(l.deposito_actual_id);
});
await prueba('la ficha manda sobre el tipo', async () => {
  await db.query(
    `update gmp.insumos_catalogo set deposito_cuarentena_id=$1 where id=$2`,
    [await dep('ENV-APR'), frasco],
  );
  const l = await lote(conRemito, frasco);
  if (l.deposito_actual_id !== (await dep('ENV-APR')))
    throw new Error(l.deposito_actual_id);
});
await prueba('sin lote del proveedor, con remito, se recibe', async () => {
  await lote(conRemito, mp, null);
});
await rechaza(
  'sin lote del proveedor y sin remito, no',
  `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
   values ('${sinRemito}', '${mp}', null, 1, 10, 'g', true)`,
  /remito/,
);
await rechaza(
  'lote del proveedor vacío sigue sin valer',
  `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
   values ('${conRemito}', '${mp}', '  ', 1, 10, 'g', true)`,
  /lote_proveedor/,
);

// Un lote viejo sin depósito: se simula vaciándolo como superusuario.
const viejo = (await lote(conRemito, frasco)).id;
await db.exec(`reset role;
  alter table gmp.lotes_insumo disable trigger user;
  update gmp.lotes_insumo set deposito_actual_id = null where id = '${viejo}';
  alter table gmp.lotes_insumo enable trigger user;`);

await como('ventas@x');
await rechaza(
  'Ventas no asigna depósitos',
  `select gmp.asignar_deposito_lote('${viejo}', (select id from gmp.depositos where numero='01'))`,
  /rol/,
);
await como('adm@x');
await rechaza(
  'un depósito de aprobados no sirve para material recién recibido',
  `select gmp.asignar_deposito_lote('${viejo}', (select id from gmp.depositos where numero='05'))`,
  /cuarentena/,
);
await prueba('Administración completa el depósito que falta', async () => {
  await q(
    `select gmp.asignar_deposito_lote($1, (select id from gmp.depositos where numero='01'))`,
    [viejo],
  );
  const l = await uno(`select deposito_actual_id from gmp.lotes_insumo where id=$1`, [
    viejo,
  ]);
  if (!l.deposito_actual_id) throw new Error('sigue sin depósito');
});
await rechaza(
  'pero no mueve un lote que ya tiene',
  `select gmp.asignar_deposito_lote('${viejo}', (select id from gmp.depositos where numero='ENV-APR'))`,
  /ya tiene depósito/,
);
await prueba('y la escritura queda auditada a su nombre', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.tabla = 'lotes_insumo' and a.registro_id = $1 and u.email = 'adm@x'`,
    [viejo],
  );
  if (a.n < 1) throw new Error('sin fila de auditoría');
});
await invariantes();
fin();
