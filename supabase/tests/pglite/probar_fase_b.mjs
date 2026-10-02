import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
const N = (x) => Number(x ?? 0);
await como('diego@x');
const caja = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja','CAJA') returning id`)).id;
const bco = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo, banco) values ('Galicia','BANCO','Galicia') returning id`)).id;
const saldo = async (c) => N((await uno(`select saldo from comercial.v_saldos_fondos where cuenta_id=$1`, [c])).saldo);
await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'INGRESO',100000,'Aporte')`, [bco]);

// B1
const grupo = (await uno(`select comercial.transferir_fondos($1, $2, 20000, 'Retiro') g`, [bco, caja])).g;
await rechaza('B1: una pata de la transferencia no se anula sola',
  `select comercial.anular_movimiento_fondos((select id from comercial.movimientos_fondos where transferencia_grupo='${grupo}' and importe < 0), 'pata suelta')`, /transferencia entera/);
await prueba('B1: la transferencia se anula entera y los dos saldos vuelven', async () => {
  const n = await uno(`select comercial.anular_transferencia($1, 'era a otra cuenta') n`, [grupo]);
  if (n.n !== 2 || (await saldo(bco)) !== 100000 || (await saldo(caja)) !== 0) throw new Error(JSON.stringify({ n, b: await saldo(bco), c: await saldo(caja) }));
});
await rechaza('B1: no se anula dos veces', `select comercial.anular_transferencia('${grupo}', 'otra vez')`, /ya está anulada/);

// B2 y B3
await prueba('B2/B3: un egreso anulado no es gasto del resultado ni flujo bruto', async () => {
  const m = (await uno(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'EGRESO',-1000,'Librería') returning id`, [bco])).id;
  await q(`insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ($1,'EGRESO',-300,'Limpieza')`, [bco]);
  await q(`select comercial.anular_movimiento_fondos($1, 'era de otro mes')`, [m]);
  const r = await uno(`select otros_egresos from comercial.v_resultado_mensual where periodo = date_trunc('month', current_date)::date`);
  const c = await uno(`select ingresos, egresos, neto from comercial.v_cash_flow_real where cuenta_id=$1 and periodo = date_trunc('month', current_date)::date`, [bco]);
  if (N(r.otros_egresos) !== 300 || N(c.ingresos) !== 100000 || N(c.egresos) !== 300 || N(c.neto) !== 99700) throw new Error(JSON.stringify({ r, c }));
});

// B5
const prov = (await uno(`insert into gmp.proveedores (razon_social) values ('Envases SA') returning id`)).id;
const prov2 = (await uno(`insert into gmp.proveedores (razon_social) values ('Otro SA') returning id`)).id;
const f1 = (await uno(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_total) values ($1,'FACTURA_B',1,10,5000) returning id`, [prov])).id;
const pago = (await uno(`select comercial.registrar_pago_proveedor($1,$2,5000,'TRANSFERENCIA',$3::jsonb) id`, [prov, bco, JSON.stringify([{ comprobante_id: f1, importe: 5000 }])])).id;
await rechaza('B5: una factura con un pago vigente imputado no se anula', `select comercial.anular_comprobante_proveedor('${f1}', 'mal cargada')`, /anulá esos pagos primero/);
await prueba('B5: anulado el pago, la factura se anula', async () => {
  await q(`select comercial.anular_pago_proveedor($1, 'importe equivocado')`, [pago]);
  await q(`select comercial.anular_comprobante_proveedor($1, 'mal cargada')`, [f1]);
  const c = await uno(`select anulado_en from comercial.comprobantes_proveedor where id=$1`, [f1]);
  if (!c.anulado_en) throw new Error('no se anuló');
});
const f2 = (await uno(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ($1,'FACTURA_A',1,11,1000,210,1210) returning id`, [prov])).id;
await q(`insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total, comprobante_asociado_id) values ($1,'NOTA_CREDITO_A',1,12,100,21,121,$2)`, [prov, f2]);
await rechaza('B5: una factura con nota de crédito vigente no se anula', `select comercial.anular_comprobante_proveedor('${f2}', 'mal')`, /notas de crédito vigentes/);

// B6
const sol = (await uno(`insert into comercial.solicitudes_pago (area, concepto, destinatario, proveedor_id, importe) values ('ADMINISTRACION','Envases','Envases SA',$1,10000) returning id`, [prov])).id;
await q(`update comercial.solicitudes_pago set estado='APROBADA' where id=$1`, [sol]);
await rechaza('B6: no se paga una solicitud con otro importe', `select comercial.registrar_pago_proveedor('${prov}','${bco}',3000,'TRANSFERENCIA','[]'::jsonb, null, null, null, '${sol}')`, /tienen que coincidir/);
await rechaza('B6: ni a otro proveedor', `select comercial.registrar_pago_proveedor('${prov2}','${bco}',10000,'TRANSFERENCIA','[]'::jsonb, null, null, null, '${sol}')`, /otro proveedor/);
await prueba('B6: con el mismo proveedor e importe, la solicitud queda pagada', async () => {
  await q(`select comercial.registrar_pago_proveedor($1,$2,10000,'TRANSFERENCIA','[]'::jsonb, null, null, null, $3)`, [prov, bco, sol]);
  const s = await uno(`select estado from comercial.solicitudes_pago where id=$1`, [sol]);
  if (s.estado !== 'PAGADA') throw new Error(JSON.stringify(s));
});

await invariantes();
fin();
