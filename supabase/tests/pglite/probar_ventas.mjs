import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
await como('silveira@x');
await q(`select comercial.registrar_conteo_pt($1, 50, 'inicial', 'C5')`, [duo]);
await como('mati@x');
let ped, cli;
await prueba('Ventas carga cliente y pedido con productos, y lo envía', async () => {
  cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Ana','CONSUMIDOR_FINAL','DNI','30111222') returning id`)).id;
  ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-1','Ana',$1) returning id`, [cli])).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,10,1000)`, [ped, duo]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);
});
await prueba('Ventas reserva en Calle 5 y despacha completo (el pedido queda entregado)', async () => {
  const c5 = (await uno(`select id from gmp.depositos where numero='C5'`)).id;
  await q(`insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,10)`, [duo, c5, ped]);
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'C5', false)`, [ped, JSON.stringify([{ producto_id: duo, cantidad: 10 }])]);
  await db.exec('set constraints all immediate; set constraints all deferred');
  const p = await uno(`select entregado_en from comercial.pedidos where id=$1`, [ped]);
  if (!p.entregado_en) throw new Error('no entregado');
});
await prueba('Ventas prepara la factura del pedido', async () => {
  const f = await uno(`select comercial.preparar_factura($1) f`, [ped]);
  if (!f.f) throw new Error('sin factura');
});
await prueba('Ventas da de alta un cliente tercerizado', async () => {
  await q(`insert into gmp.terceros (nombre, color) values ('Navi','grape')`);
});
await rechaza('Ventas no termina pedidos', `select comercial.terminar_pedido('${ped}')`, /Gerencia de Producción/);
await rechaza('Ventas no anota compras', `insert into comercial.avisos_compra (insumo_id, cantidad, unidad) select id, 1, 'UNIDAD' from gmp.insumos_catalogo limit 1`, /row-level/);
await rechaza('Ventas no crea cuentas de tesorería', `insert into comercial.cuentas_fondos (nombre, tipo) values ('X','CAJA')`, /row-level/);
await prueba('Ventas ve cobros (cuenta corriente de clientes) pero no los registra', async () => {
  await uno(`select count(*) from comercial.cobros_cliente`);
});
await rechaza('Ventas no registra cobros', `insert into comercial.cobros_cliente (cliente_id, cuenta_id, medio, importe) values ('${cli}', gen_random_uuid(), 'EFECTIVO', 1)`, /row-level|foreign/);
await invariantes();
fin();
