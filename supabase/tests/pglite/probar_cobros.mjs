import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('op@x', 'OPERARIO');
const N = (x) => Number(x ?? 0);
await como('diego@x');
const banco1 = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Galicia','BANCO') returning id`)).id;
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Ana','CONSUMIDOR_FINAL','DNI','30111222') returning id`)).id;
const cli2 = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Beto','CONSUMIDOR_FINAL','DNI','30111223') returning id`)).id;
// Facturas autorizadas cargadas como superusuario (el circuito de emisión se prueba aparte).
await db.exec('reset role');
const ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('F-1','Ana',$1,(select id from core.usuarios where email='diego@x')) returning id`, [cli])).id;
const fac = async (numero, total, dias, ambiente = 'PRODUCCION', clienteId = cli, pedido = ped) =>
  (await uno(`insert into comercial.facturas (pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta, numero, fecha, receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva, importe_neto, importe_iva, importe_total, alicuotas, estado, cae, cae_vencimiento, respuesta_arca, resuelta_en, emitida_por)
   values ($1,$2,$3,'20409378472','B',6,1,$4,current_date - $5::int,96,'30111222',5,$6,0,$6,'[]','AUTORIZADA','12345678901234',current_date+10,'{}',now(),(select id from core.usuarios where email='diego@x')) returning id`, [pedido, clienteId, ambiente, numero, dias, total])).id;
const ped2 = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('F-2','Ana',$1,(select id from core.usuarios where email='diego@x')) returning id`, [cli])).id;
const ped3 = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('F-3','Beto',$1,(select id from core.usuarios where email='diego@x')) returning id`, [cli2])).id;
const ped4 = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('F-4','Ana',$1,(select id from core.usuarios where email='diego@x')) returning id`, [cli])).id;
const f1 = await fac(1, 1000, 45);
const f2 = await fac(2, 500, 5, 'PRODUCCION', cli, ped2);
const fb = await fac(3, 800, 100, 'PRODUCCION', cli2, ped3);
await fac(4, 999, 1, 'HOMOLOGACION', cli, ped4);
await como('diego@x');
const sc = () => uno(`select * from comercial.v_saldos_clientes where cliente_id=$1`, [cli]);
await prueba('saldo y antigüedad: homologación aparte', async () => {
  const s = await sc();
  if (N(s.saldo) !== 1500 || N(s.a_60) !== 1000 || N(s.a_30) !== 500 || N(s.pendiente_homologacion) !== 999) throw new Error(JSON.stringify(s));
});
let cobro;
await prueba('cobro imputado: baja la deuda y entra al banco solo', async () => {
  cobro = (await uno(`select comercial.registrar_cobro_cliente($1,$2,1200,'TRANSFERENCIA',$3::jsonb) id`, [cli, banco1, JSON.stringify([{ factura_id: f1, importe: 1000 }])])).id;
  const s = await sc();
  if (N(s.saldo) !== 300 || N(s.facturas_pendientes) !== 500 || N(s.cobrado_sin_imputar) !== 200) throw new Error(JSON.stringify(s));
  const b = await uno(`select saldo from comercial.v_saldos_fondos where cuenta_id=$1`, [banco1]);
  if (N(b.saldo) !== 1200) throw new Error('banco');
});
await rechaza('RN-63 en cobros', `select comercial.registrar_cobro_cliente('${cli}','${banco1}',600,'EFECTIVO','[{"factura_id":"${f2}","importe":501}]'::jsonb)`, /RN-63/);
await rechaza('factura de otro cliente', `select comercial.registrar_cobro_cliente('${cli}','${banco1}',100,'EFECTIVO','[{"factura_id":"${fb}","importe":100}]'::jsonb)`, /otro cliente/);
await rechaza('el ingreso de un cobro no se anula suelto', `select comercial.anular_movimiento_fondos((select id from comercial.movimientos_fondos where cobro_id='${cobro}'), 'x x x')`, /anulando el cobro/);
await prueba('anular el cobro revierte ingreso y deuda', async () => {
  await q(`select comercial.anular_cobro_cliente($1,'cheque rechazado')`, [cobro]);
  const s = await sc();
  if (N(s.saldo) !== 1500) throw new Error(JSON.stringify(s));
  const b = await uno(`select saldo from comercial.v_saldos_fondos where cuenta_id=$1`, [banco1]);
  if (N(b.saldo) !== 0) throw new Error('banco ' + b.saldo);
});
await prueba('cash flow real y proyectado', async () => {
  await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'EGRESO',-300,'Luz')`, [banco1]);
  const r = await q(`select * from comercial.v_cash_flow_real where cuenta_id=$1`, [banco1]);
  if (N(r[0].egresos) !== 300 + 1200 && N(r[0].neto) !== -300) throw new Error(JSON.stringify(r));
  const p = await q(`select * from comercial.v_cash_flow_proyectado where tipo='COBRANZA'`);
  if (p.reduce((a, x) => a + N(x.importe), 0) !== 1000 + 500 + 800) throw new Error(JSON.stringify(p));
});
await prueba('ventas y resultado del mes (sin homologación)', async () => {
  const v = await q(`select * from comercial.v_ventas_mensuales where ambiente='PRODUCCION'`);
  const total = v.reduce((a, x) => a + N(x.neto), 0);
  if (total !== 2300) throw new Error(JSON.stringify(v));
  const r = await q(`select * from comercial.v_resultado_mensual`);
  const res = r.reduce((a, x) => a + N(x.resultado), 0);
  if (res !== 2300 - 300) throw new Error(JSON.stringify(r));
});
await como('op@x');
await prueba('un operario no ve cobros ni saldos de clientes', async () => {
  const n = await uno(`select (select count(*) from comercial.cobros_cliente) + (select count(*) from comercial.v_saldos_clientes where cobrado <> 0)::int n`);
  if (N(n.n) !== 0) throw new Error(String(n.n));
});
await invariantes();
fin();
