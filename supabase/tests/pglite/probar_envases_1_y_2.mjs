// Depósitos de envases 1 y 2: el envase aprobado elige al cargar a stock (20261026130000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
await usuario('ventas@x', 'VENTAS');

await como('silveira@x');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov D') returning id`)
).id;
const dep = async (numero) =>
  (await uno(`select id from gmp.depositos where numero = $1`, [numero])).id;

await prueba(
  'el 1 es el de aprobados de siempre, con otro nombre; el 2 es nuevo',
  async () => {
    const d = await uno(
      `select string_agg(numero || '=' || nombre || '/' || estado_admitido, ', ' order by numero) s
       from gmp.depositos where numero in ('ENV-APR', 'ENV-2')`,
    );
    if (
      d.s !==
      'ENV-2=Depósito de envases 2/APROBADO, ENV-APR=Depósito de envases 1/APROBADO'
    )
      throw new Error(d.s);
  },
);

await como('silveira@x');
const insumo = async (codigo, tipo) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, 'UNIDAD', false) returning id`,
      [codigo, tipo],
    )
  ).id;
const frasco = await insumo('ENV-D1', 'MATERIAL_ENVASE');
const etiqueta = await insumo('ETQ-D1', 'ETIQUETA');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-D', true) returning id`,
    [prov],
  )
).id;
const lote = async (ins) =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
       values ($1, $2, 'L', 1, 100, 'UNIDAD', true) returning id`,
      [rec, ins],
    )
  ).id;
const lFrasco = await lote(frasco);
const lEnCuarentena = await lote(frasco);
const lEtq = await lote(etiqueta);
const deposito = async (l) =>
  (await uno(`select deposito_actual_id d from gmp.lotes_insumo where id = $1`, [l])).d;

await rechaza(
  'en cuarentena no elige depósito de envases',
  `select gmp.elegir_deposito_envase('${lEnCuarentena}', (select id from gmp.depositos where numero = 'ENV-2'))`,
  /solo un envase aprobado/,
);
await q(`select * from gmp.control_recepcion_envase($1, true, true, true, true, true)`, [
  lFrasco,
]);
await q(`select * from gmp.control_recepcion_envase($1, true, true, true, true, true)`, [
  lEtq,
]);
await prueba('aprobado, queda en el 1 por defecto', async () => {
  if ((await deposito(lFrasco)) !== (await dep('ENV-APR')))
    throw new Error('no está en el 1');
});
await prueba('Silveira lo manda al 2', async () => {
  await q(`select gmp.elegir_deposito_envase($1, $2)`, [lFrasco, await dep('ENV-2')]);
  if ((await deposito(lFrasco)) !== (await dep('ENV-2')))
    throw new Error('no está en el 2');
});
await rechaza(
  'una etiqueta no: es solo para envases',
  `select gmp.elegir_deposito_envase('${lEtq}', (select id from gmp.depositos where numero = 'ENV-2'))`,
  /no es de envase/,
);
await rechaza(
  'ni a un depósito que no es de envases aprobados',
  `select gmp.elegir_deposito_envase('${lFrasco}', (select id from gmp.depositos where numero = '01'))`,
  /no es de envases aprobados/,
);
await como('ventas@x');
await rechaza(
  'Ventas no elige',
  `select gmp.elegir_deposito_envase('${lFrasco}', (select id from gmp.depositos where numero = 'ENV-APR'))`,
  /no puede elegir/,
);
await como('silveira@x');
await prueba('la existencia nace en el 2', async () => {
  await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
  const m = await uno(
    `select d.numero from comercial.movimientos_stock m join gmp.depositos d on d.id = m.deposito_id
      where m.lote_insumo_id = $1`,
    [lFrasco],
  );
  if (m.numero !== 'ENV-2') throw new Error(m.numero);
});
await rechaza(
  'cargada a stock, ya no se elige: es una transferencia',
  `select gmp.elegir_deposito_envase('${lFrasco}', (select id from gmp.depositos where numero = 'ENV-APR'))`,
  /transferencia/,
);
await invariantes();
fin();
