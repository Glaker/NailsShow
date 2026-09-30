import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('naza2@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
const N = (x) => Number(x ?? 0);

await como('diego@x');
const caja = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja fábrica','CAJA') returning id`)).id;
const banco1 = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo, banco) values ('Galicia CC','BANCO','Galicia') returning id`)).id;
await rechaza('cuenta de tercero sin titular', `insert into comercial.cuentas_fondos (nombre, tipo, de_tercero) values ('MP de Juan','BILLETERA', true)`, /titular/);
const terc = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo, de_tercero, titular) values ('MP de Juan','BILLETERA', true, 'Juan Pérez') returning id`)).id;
const saldo = async (c) => N((await uno(`select saldo from comercial.v_saldos_fondos where cuenta_id=$1`, [c])).saldo);

await prueba('ingreso y egreso con signo; saldo por suma', async () => {
  await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'INGRESO',100000,'Aporte inicial')`, [banco1]);
  await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'INGRESO',5000,'Cambio')`, [caja]);
  await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'EGRESO',-800,'Librería')`, [caja]);
  if ((await saldo(caja)) !== 4200) throw new Error(String(await saldo(caja)));
});
await rechaza('un egreso positivo no', `insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ('${caja}','EGRESO',10,'x')`, /signo/);
await rechaza('un movimiento no se edita', `update comercial.movimientos_fondos set importe = 1`, /permission denied/);
await rechaza('ni se borra', `delete from comercial.movimientos_fondos`, /permission denied/);
await prueba('transferencia banco → caja: dos movimientos agrupados, saldo total igual', async () => {
  await q(`select comercial.transferir_fondos($1, $2, 20000, 'Retiro para caja')`, [banco1, caja]);
  if ((await saldo(caja)) !== 24200 || (await saldo(banco1)) !== 80000) throw new Error('saldos');
});
await prueba('anular un movimiento genera su inverso', async () => {
  const m = (await uno(`select id from comercial.movimientos_fondos where concepto='Librería'`)).id;
  await q(`select comercial.anular_movimiento_fondos($1, 'era de otra caja')`, [m]);
  if ((await saldo(caja)) !== 25000) throw new Error(String(await saldo(caja)));
});
await rechaza('no se anula dos veces', `select comercial.anular_movimiento_fondos((select id from comercial.movimientos_fondos where concepto='Librería'), 'otra')`, /unique|duplicate|ya/i);
await prueba('conciliación: el saldo del sistema lo pone la base', async () => {
  const c = await uno(`insert into comercial.conciliaciones_fondos (cuenta_id, fecha, saldo_real, saldo_sistema, observacion) values ($1, current_date, 24900, 0, 'faltan 100 del arqueo') returning saldo_sistema, diferencia`, [caja]);
  if (N(c.saldo_sistema) !== 25000 || N(c.diferencia) !== -100) throw new Error(JSON.stringify(c));
});
await rechaza('diferencia sin explicar', `insert into comercial.conciliaciones_fondos (cuenta_id, fecha, saldo_real, saldo_sistema) values ('${caja}', current_date, 1, 0)`, /explicada/);

// Proveedor con dos facturas, una NC y pagos.
const prov = (await uno(`insert into gmp.proveedores (razon_social) values ('Envases SA') returning id`)).id;
const f1 = (await uno(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total, vencimiento_pago, fecha) values ($1,'FACTURA_A',1,10,10000,2100,12100, current_date - 5, current_date - 35) returning id`, [prov])).id;
const f2 = (await uno(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_total, vencimiento_pago) values ($1,'FACTURA_B',1,11,5000, current_date + 10) returning id`, [prov])).id;
const sf = (await uno(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, importe_total) values ($1,'SIN_FACTURA',3000) returning id`, [prov])).id;
await q(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total, comprobante_asociado_id) values ($1,'NOTA_CREDITO_A',1,12,1000,210,1210,$2)`, [prov, f1]);
const saldoProv = async () => uno(`select * from comercial.v_saldos_proveedores where proveedor_id=$1`, [prov]);
await prueba('cuenta corriente: facturas y sin factura al debe, NC al haber', async () => {
  const s = await saldoProv();
  if (N(s.saldo) !== 12100 + 5000 + 3000 - 1210) throw new Error(JSON.stringify(s));
  if (N(s.vencido) !== 12100 - 1210) throw new Error('vencido ' + s.vencido);
});
let pago;
await prueba('pago con imputación: baja la deuda y genera el egreso del banco solo', async () => {
  pago = (await uno(`select comercial.registrar_pago_proveedor($1,$2,11000,'TRANSFERENCIA',$3::jsonb) id`, [prov, banco1, JSON.stringify([{ comprobante_id: f1, importe: 10890 }])])).id;
  const s = await saldoProv();
  if (N(s.saldo) !== 18890 - 11000 || N(s.vencido) !== 0) throw new Error(JSON.stringify(s));
  if ((await saldo(banco1)) !== 80000 - 11000) throw new Error('banco');
  const p = await uno(`select pendiente from comercial.v_comprobantes_proveedor_pendientes where comprobante_id=$1`, [f1]);
  if (N(p.pendiente) !== 0) throw new Error('pendiente ' + p.pendiente);
});
await rechaza('RN-63: no se imputa más que lo pendiente', `select comercial.registrar_pago_proveedor('${prov}','${banco1}',6000,'EFECTIVO','[{"comprobante_id":"${f2}","importe":5001}]')`, /RN-63/);
await rechaza('ni más que el pago', `select comercial.registrar_pago_proveedor('${prov}','${banco1}',100,'EFECTIVO','[{"comprobante_id":"${f2}","importe":200}]')`, /ya tiene|RN-63/);
await rechaza('una NC no se paga', `select comercial.registrar_pago_proveedor('${prov}','${banco1}',100,'EFECTIVO',('[{"comprobante_id":"' || (select id from comercial.comprobantes_proveedor where tipo='NOTA_CREDITO_A') || '","importe":100}]')::jsonb)`, /nota de crédito no se paga|RN-63/);
await rechaza('un pago no se edita', `update comercial.pagos_proveedor set importe = 1 where id='${pago}'`, /no se edita/);
await prueba('anular el pago revierte el egreso y la deuda vuelve', async () => {
  await q(`select comercial.anular_pago_proveedor($1, 'transferencia rechazada')`, [pago]);
  if ((await saldo(banco1)) !== 80000) throw new Error('banco ' + (await saldo(banco1)));
  const s = await saldoProv();
  if (N(s.saldo) !== 18890) throw new Error(JSON.stringify(s));
});
await rechaza('el egreso de un pago no se anula suelto', `select comercial.anular_movimiento_fondos((select id from comercial.movimientos_fondos where pago_id='${pago}' and anula_a_id is null), 'x x')`, /anulando el pago/);
await prueba('conciliación contra el saldo informado por el proveedor', async () => {
  const c = await uno(`insert into comercial.conciliaciones_proveedor (proveedor_id, fecha, saldo_informado, saldo_sistema, observacion) values ($1, current_date, 17890, 0, 'no tienen cargada la de 3000 sin factura... falta ver') returning saldo_sistema, diferencia`, [prov]);
  if (N(c.saldo_sistema) !== 18890 || N(c.diferencia) !== -1000) throw new Error(JSON.stringify(c));
  const s = await saldoProv();
  if (N(s.diferencia_conciliacion) !== -1000) throw new Error('vista');
});
await prueba('IVA del mes: crédito de A menos NC A; sin factura aparte', async () => {
  const f = await q(`select * from comercial.v_iva_mensual`);
  const credito = f.reduce((a, r) => a + N(r.credito_fiscal), 0);
  const sinFac = f.reduce((a, r) => a + N(r.compras_sin_factura), 0);
  if (credito !== 2100 - 210 || sinFac !== 3000) throw new Error(JSON.stringify(f));
});

// Solicitudes de pago
await como('naza2@x');
let sol, sol2;
await prueba('Producción pide un pago; ve la suya', async () => {
  sol = (await uno(`insert into comercial.solicitudes_pago (area, concepto, destinatario, proveedor_id, comprobante_id, importe, vencimiento) values ('PRODUCCION','Envases del pedido P-3','Envases SA',$1,$2,5000, current_date + 10) returning id`, [prov, f2])).id;
  sol2 = (await uno(`insert into comercial.solicitudes_pago (area, concepto, destinatario, importe) values ('PRODUCCION','Service de la balanza','Técnico Gómez',15000) returning id`)).id;
  const n = await uno(`select count(*)::int n from comercial.solicitudes_pago`);
  if (n.n !== 2) throw new Error(String(n.n));
});
await rechaza('el solicitante no se aprueba solo', `update comercial.solicitudes_pago set estado='APROBADA' where id='${sol}'`, /Administración/);
await rechaza('Producción no ve la tesorería', `select public.verdad((select count(*) from comercial.cuentas_fondos) > 0, 've cuentas')`, /ASERCION/);
await como('op@x');
await prueba('otro usuario no ve solicitudes ajenas', async () => {
  const n = await uno(`select count(*)::int n from comercial.solicitudes_pago`);
  if (n.n !== 0) throw new Error(String(n.n));
});
await como('diego@x');
await prueba('Administración aprueba y paga con pago a proveedor (baja la cuenta corriente)', async () => {
  await q(`update comercial.solicitudes_pago set estado='APROBADA' where id=$1`, [sol]);
  await q(`select comercial.registrar_pago_proveedor($1,$2,5000,'TRANSFERENCIA',$3::jsonb, null, null, null, $4)`, [prov, banco1, JSON.stringify([{ comprobante_id: f2, importe: 5000 }]), sol]);
  const s = await uno(`select estado, pago_id, resuelto_por from comercial.solicitudes_pago where id=$1`, [sol]);
  if (s.estado !== 'PAGADA' || !s.pago_id || !s.resuelto_por) throw new Error(JSON.stringify(s));
});
await rechaza('pagar sin aprobar', `select comercial.pagar_solicitud_con_egreso('${sol2}', '${caja}')`, /no pasa de PENDIENTE a PAGADA/);
await prueba('solicitud sin proveedor: se paga con egreso de caja', async () => {
  await q(`update comercial.solicitudes_pago set estado='APROBADA' where id=$1`, [sol2]);
  await q(`select comercial.pagar_solicitud_con_egreso($1, $2)`, [sol2, caja]);
  if ((await saldo(caja)) !== 10000) throw new Error(String(await saldo(caja)));
});
await rechaza('una solicitud pagada no vuelve', `update comercial.solicitudes_pago set estado='ANULADA', motivo='x' where id='${sol2}'`, /no pasa/);
await prueba('traza de compra: aviso → recepción → comprobante → pagado', async () => {
  const ins = (await uno(`select id from gmp.insumos_catalogo where codigo_interno='105BOL'`)).id;
  await como('naza2@x');
  const av = (await uno(`insert into comercial.avisos_compra (insumo_id, cantidad, unidad, estado, proveedor_id) values ($1, 10, 'UNIDAD', 'EN_COMPRA', $2) returning id`, [ins, prov])).id;
  let t = await uno(`select situacion from comercial.v_compras_trazadas where aviso_id=$1`, [av]);
  if (t.situacion !== 'SIN_RECIBIR') throw new Error(t.situacion);
  const rec = (await uno(`insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1,'R9',true) returning id`, [prov])).id;
  const lote = (await uno(`insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados) values ($1,$2,'L9',1,10,'UNIDAD',true) returning id`, [rec, ins])).id;
  await q(`select comercial.vincular_recepcion_compras($1, $2::jsonb)`, [rec, JSON.stringify([{ aviso_id: av, lote_insumo_id: lote, completa: true }])]);
  t = await uno(`select situacion from comercial.v_compras_trazadas where aviso_id=$1`, [av]);
  if (t.situacion !== 'SIN_COMPROBANTE') throw new Error(t.situacion);
  await q(`insert into comercial.comprobantes_proveedor (proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_total) values ($1,$2,'FACTURA_C',2,1,700)`, [prov, rec]);
  await como('diego@x');
  t = await uno(`select situacion, pendiente from comercial.v_compras_trazadas where aviso_id=$1`, [av]);
  if (t.situacion !== 'IMPAGA' || N(t.pendiente) !== 700) throw new Error(JSON.stringify(t));
});
await invariantes();
fin();
