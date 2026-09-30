import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const hoy = (await uno(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d`)).d;

await como('diego@x');
const caja = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja fábrica','CAJA') returning id`)).id;
const galicia = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo, banco) values ('Galicia CC','BANCO','Galicia') returning id`)).id;
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Ana','CONSUMIDOR_FINAL','DNI','30111222') returning id`)).id;
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
await db.exec('reset role');
const ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('P-F','Ana',$1,(select id from core.usuarios where email='naza@x')) returning id`, [cli])).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario, alicuota_iva) values ($1,$2,10,100,0)`, [ped, duo]);
const fac = (await uno(`insert into comercial.facturas (pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta, numero, receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva, importe_neto, importe_iva, importe_total, alicuotas, estado, cae, cae_vencimiento, respuesta_arca, resuelta_en, emitida_por)
  values ($1,$2,'PRODUCCION','20409378472','B',6,1,1,96,'30111222',5,1000,0,1000,'[]','AUTORIZADA','12345678901234',current_date+10,'{}',now(),(select id from core.usuarios where email='diego@x')) returning id`, [ped, cli])).id;
const prov = (await uno(`select id from gmp.proveedores limit 1`)).id;
await como('diego@x');
await q(`select comercial.registrar_cobro_cliente($1,$2,1000,'TRANSFERENCIA',$3::jsonb)`, [cli, galicia, JSON.stringify([{ factura_id: fac, importe: 1000 }])]);
await q(`select comercial.registrar_pago_proveedor($1,$2,300,'EFECTIVO','[]'::jsonb)`, [prov, caja]);
await q(`select comercial.transferir_fondos($1, $2, 100, 'Retiro para caja')`, [galicia, caja]);

await prueba('el día: entró 1000, salió 300; la transferencia no es flujo', async () => {
  const r = await uno(`select * from comercial.flujo_caja_diario($1::date - 2, $1::date) where fecha = $1::date`, [hoy]);
  if (N(r.ingresos) !== 1000 || N(r.egresos) !== 300 || N(r.neto) !== 700) throw new Error(JSON.stringify(r));
  if (N(r.saldo_bancos) !== 900 || N(r.saldo_efectivo) !== -200) throw new Error(JSON.stringify(r));
});
await prueba('un día por fila, también los días sin movimiento', async () => {
  const r = await q(`select * from comercial.flujo_caja_diario($1::date - 6, $1::date)`, [hoy]);
  if (r.length !== 7 || N(r[0].neto) !== 0) throw new Error(String(r.length));
});
await rechaza('el período tiene tope', `select * from comercial.flujo_caja_diario(current_date - 500, current_date)`, /400 días/);
await prueba('el detalle del día: de dónde vino y adónde fue', async () => {
  const d = (await uno(`select comercial.flujo_caja_dia($1::date) d`, [hoy])).d;
  const cobro = d.movimientos.find((m) => m.cobro)?.cobro;
  const f = cobro?.facturas?.[0];
  if (cobro?.cliente !== 'Ana' || f?.vendedor !== 'naza@x' || f?.productos?.[0]?.cantidad !== 10 || !f?.a_nombre_de) throw new Error(JSON.stringify(cobro));
  if (!d.movimientos.some((m) => m.pago?.proveedor)) throw new Error('sin pago');
  const g = d.cuentas.find((c) => c.cuenta === 'Galicia CC');
  if (N(g.saldo) !== 900 || N(g.entro) !== 1000 || N(g.salio) !== 100) throw new Error(JSON.stringify(g));
});
await prueba('tortas: venta por cliente', async () => {
  const r = await q(`select * from comercial.volumenes_por_contraparte($1::date - 30, $1::date)`, [hoy]);
  const v = r.find((x) => x.lado === 'VENTA');
  if (v?.contraparte !== 'Ana' || N(v.total) !== 1000) throw new Error(JSON.stringify(r));
});
await como('naza@x');
await prueba('Producción no ve la tesorería: el flujo le da vacío', async () => {
  const r = await uno(`select sum(ingresos) s from comercial.flujo_caja_diario($1::date - 2, $1::date)`, [hoy]);
  if (N(r.s) !== 0) throw new Error(String(r.s));
});

await invariantes();
fin();
