// Envases controlados en la recepción y cargados en aprobados (20261021160000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('silveira@x', 'RECEPCION');

await como('naza@x');
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov V') returning id`)
).id;
const dep = async (numero) =>
  (await uno(`select id from gmp.depositos where numero = $1`, [numero])).id;

await como('naza@x');
const insumo = async (codigo, tipo, unidad = 'UNIDAD') =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, $3, false) returning id`,
      [codigo, tipo, unidad],
    )
  ).id;
const frasco = await insumo('ENV-V1', 'MATERIAL_ENVASE');
const etiqueta = await insumo('ETQ-V1', 'ETIQUETA');
const etiqueta2 = await insumo('ETQ-V2', 'ETIQUETA');
const mp = await insumo('MP-V1', 'MATERIA_PRIMA', 'g');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-V', true) returning id`,
    [prov],
  )
).id;
const lote = async (ins, unidad = 'UNIDAD') =>
  (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
       values ($1, $2, 'L', 2, 200, $3, true) returning id`,
      [rec, ins, unidad],
    )
  ).id;
const lFrasco = await lote(frasco);
const lEtq = await lote(etiqueta);
const lEtq2 = await lote(etiqueta2);
const lEtq3 = await lote(etiqueta2);
const lMp = await lote(mp, 'g');
const estado = async (l) =>
  uno(`select estado, deposito_actual_id from gmp.lotes_insumo where id = $1`, [l]);

await prueba('el envase recién recibido está en el depósito de cuarentena', async () => {
  if ((await estado(lFrasco)).deposito_actual_id !== (await dep('01')))
    throw new Error('no está en 01');
});
await prueba(
  'Naza lo controla y aprueba: queda aprobado y en «Envases aprobados»',
  async () => {
    const r = await uno(
      `select * from gmp.control_recepcion_envase($1, true, true, true, true, true)`,
      [lFrasco],
    );
    if (!r.aprobado || r.registro !== 'R.50.5.1') throw new Error(JSON.stringify(r));
    const e = await estado(lFrasco);
    if (e.estado !== 'APROBADO' || e.deposito_actual_id !== (await dep('ENV-APR')))
      throw new Error(JSON.stringify(e));
    const m = await uno(
      `select cantidad_tomada::int n from gmp.muestreos where entidad_tipo = 'lote_insumo' and entidad_id = $1`,
      [lFrasco],
    );
    if (m.n !== 10) throw new Error('muestra ' + m.n); // 5 % de 200
  },
);
await rechaza(
  'Naza no controla materia prima',
  `select gmp.control_recepcion_envase('${lMp}', true, true, true, true, true)`,
  /envases, empaques y etiquetas/,
);
await como('silveira@x');
await prueba('Silveira aprueba una etiqueta', async () => {
  await q(`select gmp.control_recepcion_envase($1, true, true, true, true, true)`, [
    lEtq,
  ]);
  if ((await estado(lEtq)).estado !== 'APROBADO') throw new Error('no quedó aprobada');
});
await prueba('y rechaza otra: queda rechazada y en cuarentena', async () => {
  await q(
    `select gmp.control_recepcion_envase($1, true, true, true, false, false, 'impresión corrida')`,
    [lEtq2],
  );
  const e = await estado(lEtq2);
  if (e.estado !== 'RECHAZADO' || e.deposito_actual_id !== (await dep('01')))
    throw new Error(JSON.stringify(e));
});
await rechaza(
  'con el aspecto mal no se aprueba',
  `select gmp.control_recepcion_envase('${lMp}', true, true, true, false, true)`,
  /./,
);
await rechaza(
  'con la cantidad que no coincide con el remito no se aprueba',
  `select gmp.control_recepcion_envase('${lEtq3}', true, true, false, true, true)`,
  /cantidad no conformes/,
);
await rechaza(
  'RN-10 en la tabla: un muestreo directo con el rótulo mal no entra',
  `insert into gmp.muestreos (entidad_id, categoria, cantidad_tomada, unidad, contenedor_integro, contenedor_limpio,
     rotulado_correcto, cantidad_contenedores_verificada, destino_sobrante, area_muestreo)
   values ('${lEtq3}', 'MATERIAL_ENVASE_EMPAQUE', 1, 'UNIDAD', true, true, false, 1, 'REUTILIZACION_ENVASE', 'x')`,
  /muestreos_rn10|RN-10|check/i,
);
await como('naza@x');
await prueba(
  'la carga a stock pone el envase aprobado directo en «Envases aprobados»',
  async () => {
    await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
    const s = await uno(
      `select d.numero from comercial.v_saldos_stock s join gmp.depositos d on d.id = s.deposito_id
      where s.lote_insumo_id = $1 and s.saldo > 0`,
      [lFrasco],
    );
    if (s.numero !== 'ENV-APR') throw new Error(s.numero);
  },
);
await invariantes();
fin();
