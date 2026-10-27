// Dónde está cada insumo de un producto: depósito, estiba, saldo y
// vencimiento de los lotes usables (20261026180000, D-ubicacion-insumos-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('delia@x', 'PRODUCCION');

await como('naza@x');
const naza = (await uno(`select core.usuario_actual() id`)).id;
const prod = (
  await uno(`select id from gmp.productos where activo order by codigo_interno limit 1`)
).id;
const insumo = async (codigo, tipo, unidad) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, $3, false) returning id`,
      [codigo, tipo, unidad],
    )
  ).id;
const mp = await insumo('MP-U1', 'MATERIA_PRIMA', 'g');
const frasco = await insumo('ENV-U1', 'MATERIAL_ENVASE', 'UNIDAD');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov U') returning id`)
).id;
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-U', true) returning id`,
    [prov],
  )
).id;

// Preparación como superusuario y sin triggers: el circuito de calidad y de
// stock se prueba en sus suites; acá importa la consulta.
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
const formula = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version, densidad_producto, estado, aprobada_por, aprobada_en, emitida_por)
     values ($1, 'U1', 1, 'VIGENTE', $2, now(), $2) returning id`,
    [prod, naza],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1, 1, $2, 50)`,
  [formula, mp],
);
await q(
  `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad) values ($1, $2, 1)`,
  [prod, frasco],
);
const dep = async (n) =>
  (await uno(`select id from gmp.depositos where numero = $1`, [n])).id;
const lote = async (ins, numero, estado, vence, estiba, deposito, cantidad, unidad) => {
  const l = (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, numero_registro_interno, lote_proveedor, plazo_validez,
         cantidad_bultos, cantidad_unidades, unidad, estado, estiba, deposito_actual_id, registrado_por)
       values ($1, $2, $3, 'L', $4, 1, $5, $6, $7, $8, $9, $10) returning id`,
      [rec, ins, numero, vence, cantidad, unidad, estado, estiba, deposito, naza],
    )
  ).id;
  await q(
    `insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, unidad, registrado_por)
     values (comercial.articulo_de_insumo($1), $2, $3, 'ENTRADA_COMPRA', $4, $5, $6)`,
    [ins, l, deposito, cantidad, unidad, naza],
  );
};
await lote(mp, 'RI-U2', 'APROBADO', '2027-12-31', null, await dep('05'), 3000, 'g');
await lote(mp, 'RI-U1', 'APROBADO', '2027-03-31', 'B-12', await dep('05'), 1000, 'g');
await lote(mp, 'RI-U3', 'CUARENTENA', '2027-01-31', 'A-1', await dep('04'), 500, 'g');
await db.exec('set session_replication_role = origin');

await como('delia@x');
const filas = await q(`select * from comercial.ubicacion_insumos_producto($1)`, [prod]);
const deMp = filas.filter((f) => f.codigo === 'MP-U1');
await prueba(
  'Delia ve los lotes aprobados de la materia prima, el que vence antes primero',
  async () => {
    if (deMp.map((f) => f.lote).join() !== 'RI-U1,RI-U2')
      throw new Error(JSON.stringify(deMp));
  },
);
await prueba('con depósito, estiba y cuánto queda', async () => {
  const f = deMp[0];
  if (
    f.estiba !== 'B-12' ||
    Number(f.saldo) !== 1000 ||
    !f.deposito ||
    f.para !== 'Fórmula'
  )
    throw new Error(JSON.stringify(f));
});
await prueba('el lote en cuarentena no sale: no se puede usar', async () => {
  if (filas.some((f) => f.lote === 'RI-U3')) throw new Error('salió');
});
await prueba('el frasco sin stock igual figura, para ver que falta', async () => {
  const f = filas.find((x) => x.codigo === 'ENV-U1');
  if (!f || f.lote !== null || f.para !== 'Acondicionamiento')
    throw new Error(JSON.stringify(f));
});
await invariantes();
fin();
