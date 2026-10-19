// Atajos por PATCH directo (revisión del 2026-10-16, 20261016120000): lo que
// una RPC exige lo exige también la tabla, y nadie firma por otro.
import { banco, CLAVE_ARCA } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('otra@x', 'OPERARIO');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
const IDS = Object.fromEntries((await q(`select email, id from core.usuarios`)).map((u) => [u.email, u.id]));
const id = async (email) => IDS[email];
const OTRA = IDS['otra@x'];

// ------------------------------ Autores ------------------------------
await como('diego@x');
await prueba('un INSERT con el autor de otro queda a nombre de quien escribe', async () => {
  const c = await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento, creado_por)
    values ('Ana','CONSUMIDOR_FINAL','DNI','30111222',$1) returning id, creado_por`, [OTRA]);
  if (c.creado_por !== (await id('diego@x'))) throw new Error(JSON.stringify(c));
});

// ------------------------------ Órdenes ------------------------------
await como(DT);
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const f = await uno(`insert into gmp.formulas_fabricacion (producto_id, version, codigo_me) values ($1,'00','ME.40.26') returning id, producto_id`, [prod]);
await como('naza@x');
const op = await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, presentacion, cantidad_teorica, vencimiento)
  values ($1,$2,'2025-07-11',1,1,50,'2028-07-01') returning id`, [f.id, f.producto_id]);
await rechaza('Producción no termina por PATCH sin fraccionamiento',
  `update gmp.ordenes_produccion set estado='TERMINADA', cantidad_obtenida=50, unidades_obtenidas=1 where id='${op.id}'`, /fraccionamiento/);
await como('op@x');
await q(`insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`, [op.id]);
await como('naza@x');
await prueba('terminar por PATCH firma quien termina, no el id que manda el cliente', async () => {
  await q(`update gmp.ordenes_produccion set estado='TERMINADA', terminada_por=$2, terminada_en='2000-01-01',
           cantidad_obtenida=50, unidades_obtenidas=1 where id=$1`, [op.id, OTRA]);
  const o = await uno(`select terminada_por, terminada_en > now() - interval '1 minute' reciente from gmp.ordenes_produccion where id=$1`, [op.id]);
  if (o.terminada_por !== (await id('naza@x')) || !o.reciente) throw new Error(JSON.stringify(o));
});
await como(DT);
await rechaza('la DT no libera por PATCH sin etapas ni control de calidad',
  `update gmp.ordenes_produccion set estado='LIBERADA', liberada_por='${OTRA}' where id='${op.id}'`, /no se puede liberar/);
await prueba('fuera de la transición, la firma de liberación no se escribe', async () => {
  await q(`update gmp.ordenes_produccion set observaciones='x', liberada_por=$2, liberada_en=now() where id=$1`, [op.id, OTRA]);
  const o = await uno(`select liberada_por, liberada_en from gmp.ordenes_produccion where id=$1`, [op.id]);
  if (o.liberada_por !== null || o.liberada_en !== null) throw new Error(JSON.stringify(o));
});
await prueba('rechazar por PATCH es de la DT y firma la DT', async () => {
  await q(`update gmp.ordenes_produccion set estado='RECHAZADA', liberada_por=$2, motivo_cierre='prueba' where id=$1`, [op.id, OTRA]);
  const o = await uno(`select estado, liberada_por from gmp.ordenes_produccion where id=$1`, [op.id]);
  if (o.estado !== 'RECHAZADA' || o.liberada_por !== (await id(DT))) throw new Error(JSON.stringify(o));
});

// ------------------------------ Especificaciones ------------------------------
await como('naza@x');
const esp = (await uno(`insert into gmp.especificaciones (codigo_poe, version, denominacion, vida_util_meses)
  values ('I-E.ATAJO','00','PRUEBA',24) returning id`)).id;
await como(DT);
await rechaza('sin requisitos no pasa a vigente por PATCH',
  `update gmp.especificaciones set estado='VIGENTE' where id='${esp}'`, /sin requisitos/);
await como('naza@x');
await q(`insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, unidad)
  values ($1,1,'Densidad','FISICOQUIMICO','RANGO',0.9,1,'g/ml')`, [esp]);
await rechaza('Producción no la pasa a vigente por PATCH',
  `update gmp.especificaciones set estado='VIGENTE' where id='${esp}'`, /Dirección Técnica/);
await como(DT);
await prueba('la DT la aprueba por PATCH: firma la DT, no el aprobador que manda el cliente', async () => {
  await q(`update gmp.especificaciones set estado='VIGENTE', aprobada_por=$2, aprobada_en='2000-01-01' where id=$1`, [esp, OTRA]);
  const e = await uno(`select aprobada_por, vigencia_desde is not null v from gmp.especificaciones where id=$1`, [esp]);
  if (e.aprobada_por !== (await id(DT)) || !e.v) throw new Error(JSON.stringify(e));
});
await como('naza@x');
const esp2 = (await uno(`select gmp.nueva_version_especificacion($1, 'ajuste') id`, [esp])).id;
await rechaza('Producción no da de baja la vigente',
  `update gmp.especificaciones set estado='DADO_DE_BAJA' where id='${esp}'`, /Dirección Técnica/);
await como(DT);
await rechaza('una segunda vigente por PATCH no pasa',
  `update gmp.especificaciones set estado='VIGENTE' where id='${esp2}'`, /vigente/);
await prueba('por la función sí: da de baja la anterior', async () => {
  await q(`select gmp.aprobar_especificacion($1)`, [esp2]);
  const n = await uno(`select count(*)::int n from gmp.especificaciones where codigo_poe='I-E.ATAJO' and estado='VIGENTE'`);
  if (n.n !== 1) throw new Error(JSON.stringify(n));
});

// ------------------------------ Facturas ------------------------------
await como('diego@x');
const cli = (await uno(`select id from comercial.clientes where razon_social='Ana'`)).id;
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const pedido = async (numero) => {
  await como('diego@x');
  const p = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ($1,'Ana',$2) returning id`, [numero, cli])).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,1,1000)`, [p, duo]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
  await como('mati@x');
  return p;
};
const RESP = JSON.stringify({ FECAESolicitarResult: { FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '11111111111111', CAEFchVto: '20991231' }] } } });
const p1 = await pedido('P-AT1');
await rechaza('Ventas no inserta una factura directo',
  `insert into comercial.facturas (pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta, receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva, importe_neto, importe_iva, importe_total, alicuotas)
   values ('${p1}','${cli}','HOMOLOGACION','20111111112','B',6,1,96,'30111222',5,1,0,1,'[]')`, /permission denied/);
const fa = (await uno(`select comercial.preparar_factura($1) f`, [p1])).f;
await rechaza('Ventas no la actualiza directo',
  `update comercial.facturas set numero=999 where id='${fa.factura_id}'`, /permission denied/);
await rechaza('ni siquiera la columna que habilita el bloqueo de fila',
  `update comercial.facturas set motivo='x' where id='${fa.factura_id}'`, /solo cambian/);
await rechaza('sin la clave de la emisión no se fija el número',
  `select comercial.fijar_numero_factura('${fa.factura_id}', 4242, 'inventada-inventada-inventada-inventada')`, /llamada suelta/);
await rechaza('sin la clave de la emisión no se registra un CAE',
  `select comercial.registrar_resultado_factura('${fa.factura_id}', '{}', '${RESP}', null, null)`, /llamada suelta/);
await rechaza('la firma vieja, sin clave, ya no existe',
  `select comercial.registrar_resultado_factura('${fa.factura_id}', '{}'::jsonb, '${RESP}'::jsonb)`, /does not exist/);
await prueba('con la clave (la Edge Function) se autoriza y firma quien emitió', async () => {
  await q(`select comercial.fijar_numero_factura($1, 1, $2)`, [fa.factura_id, CLAVE_ARCA]);
  const r = (await uno(`select comercial.registrar_resultado_factura($1, '{}', $2, null, $3) r`, [fa.factura_id, RESP, CLAVE_ARCA])).r;
  const e = await uno(`select emitida_por from comercial.facturas where id=$1`, [fa.factura_id]);
  if (r.estado !== 'AUTORIZADA' || e.emitida_por !== (await id('mati@x'))) throw new Error(JSON.stringify({ r, e }));
});

// ------------------------------ Numeración GMP ------------------------------
await como('op@x');
await rechaza('nadie quema números llamando a siguiente_numero suelta',
  `select gmp.siguiente_numero('recepcion', 2026)`, /llamada suelta/);

await invariantes();
fin();
