import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const imm = () => db.exec('set constraints all immediate; set constraints all deferred');
const prod = async (c) => (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const pack = await prod('80PACK'), mono = await prod('101');
let cliPadron = null;
const venta = async (n) =>
  (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id, es_venta, forma_pago) values ($1,'Cliente mayorista',$2,true,'Transferencia a Nail') returning id`, [n, cliPadron])).id;
const renglon = (p, producto, cant) =>
  uno(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3) returning *`, [p, producto, cant]);
const r = (p, producto) =>
  uno(`select * from comercial.pedido_renglones where pedido_id=$1 and producto_id=$2 and not anulado`, [p, producto]);
const fila = (p) => uno(`select * from comercial.v_ventas where id=$1`, [p]);

await prueba('lista 46.14: 178 productos; 80PACK es pack de 6 a $3200 la unidad', async () => {
  const n = await uno(`select count(*)::int n from comercial.v_lista_mayorista`);
  const l = await uno(`select * from comercial.v_lista_mayorista where producto_id=$1`, [pack]);
  if (n.n !== 178 || l.unidades_pack !== 6 || N(l.precio_promo) !== 3200 || N(l.precio_base) !== 19200) throw new Error(JSON.stringify({ n, l }));
});
await prueba('escala de la planilla: 0 / 20 / 25 / 30 / 35 %', async () => {
  const x = await uno(`select comercial.descuento_por_monto(624999) a, comercial.descuento_por_monto(625000) b,
    comercial.descuento_por_monto(1449999) c, comercial.descuento_por_monto(1450000) d, comercial.descuento_por_monto(5000000) e`);
  if ([x.a, x.b, x.c, x.d, x.e].map(N).join() !== '0,20,25,30,35') throw new Error(JSON.stringify(x));
});

await como('mati@x');
cliPadron = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Cliente mayorista','CONSUMIDOR_FINAL','DNI','30999888') returning id`)).id;
const p1 = await venta('V-1');
await prueba('el renglón toma el precio del pack de la lista; sin descuento bajo $625 mil', async () => {
  await renglon(p1, pack, 5);
  const x = await r(p1, pack);
  if (N(x.precio_base) !== 19200 || N(x.precio_final) !== 19200 || N(x.precio_unitario) !== 15867.7686) throw new Error(JSON.stringify(x));
});
await prueba('al pasar $625 mil el 20 % se aplica al pedido entero, redondeado a pesos por unidad', async () => {
  await renglon(p1, mono, 70); // 5×19200 + 70×8500 = 691000
  const a = await r(p1, pack), b = await r(p1, mono), f = await fila(p1);
  if (N(a.precio_final) !== 15360 || N(b.precio_final) !== 6800 || N(f.descuento_aplicado) !== 20
      || N(f.importe_lista) !== 691000 || N(f.importe_total) !== 552800) throw new Error(JSON.stringify({ a, b, f }));
});
await prueba('Ventas fija otro descuento para el pedido y se recalcula', async () => {
  await q(`update comercial.pedidos set descuento_pct=40 where id=$1`, [p1]);
  const b = await r(p1, mono);
  if (N(b.precio_final) !== 5100) throw new Error(JSON.stringify(b));
  await q(`update comercial.pedidos set descuento_pct=null where id=$1`, [p1]);
});
await prueba('un precio escrito a mano se respeta; los demás siguen la escala', async () => {
  await q(`update comercial.pedido_renglones set precio_manual=true, precio_final=6000 where pedido_id=$1 and producto_id=$2`, [p1, mono]);
  const a = await r(p1, pack), b = await r(p1, mono);
  if (N(b.precio_final) !== 6000 || N(b.precio_unitario) !== 4958.6777 || N(a.precio_final) !== 15360) throw new Error(JSON.stringify({ a, b }));
});

await como('naza@x');
await q(`select comercial.registrar_conteo_pt($1, 20, 'inicial', 'C5')`, [mono]);
await q(`select comercial.registrar_conteo_pt($1, 10, 'inicial', 'C5')`, [pack]);
await como('mati@x');
let envio;
await prueba('al enviar: lo que hay se reserva en Calle 5 y lo que falta va a Producción en un S-xxxx', async () => {
  envio = await uno(`select comercial.enviar_venta($1) x`, [p1]);
  await imm();
  const a = await r(p1, pack), b = await r(p1, mono);
  const s = await uno(`select * from comercial.pedidos where para_pedido_id=$1`, [p1]);
  const rs = await uno(`select cantidad from comercial.pedido_renglones where pedido_id=$1`, [s.id]);
  const res = await uno(`select count(*)::int n from comercial.reservas_pt where pedido_id=$1`, [p1]);
  const ped = await uno(`select estado from comercial.pedidos where id=$1`, [p1]);
  if (N(a.de_calle5) !== 5 || N(a.a_producir) !== 0 || N(b.de_calle5) !== 20 || N(b.a_producir) !== 50
      || !/^S-\d{4}$/.test(s.numero) || !s.para_stock || s.estado !== 'CONFIRMADO' || N(rs.cantidad) !== 50
      || res.n !== 2 || ped.estado !== 'CONFIRMADO' || N(envio.x.a_producir) !== 50)
    throw new Error(JSON.stringify({ a, b, s, rs, res, ped, envio }));
});
const p2 = await venta('V-2');
await prueba('otra venta no puede tomar lo que la primera reservó', async () => {
  await renglon(p2, mono, 10);
  await q(`select comercial.enviar_venta($1)`, [p2]);
  const b = await r(p2, mono);
  const d = await uno(`select * from comercial.v_disponible_calle5 where producto_id=$1`, [mono]);
  const e = await uno(`select * from comercial.v_disponible_calle5 where producto_id=$1`, [pack]);
  if (N(b.de_calle5) !== 0 || N(b.a_producir) !== 10 || N(d.disponible) !== 0 || N(d.reservado) !== 20
      || N(d.tomado_sin_reservar) !== 0 || N(e.reservado) !== 5 || N(e.disponible) !== 5) throw new Error(JSON.stringify({ b, d, e }));
});
const p3 = await venta('V-3');
await renglon(p3, pack, 4);
await rechaza('Ventas no toma de Calle 5 más que lo disponible', `select comercial.enviar_venta('${p3}', '[{"producto_id":"${pack}","cantidad":5}]'::jsonb)`, /disponibles/);
await prueba('decide Ventas: de 5 disponibles toma 2 para este cliente, el resto se produce', async () => {
  await q(`select comercial.enviar_venta($1, $2::jsonb)`, [p3, JSON.stringify([{ producto_id: pack, cantidad: 2 }])]);
  await imm();
  const b = await r(p3, pack);
  const d = await uno(`select * from comercial.v_disponible_calle5 where producto_id=$1`, [pack]);
  if (N(b.de_calle5) !== 2 || N(b.a_producir) !== 2 || N(d.reservado) !== 7 || N(d.disponible) !== 3) throw new Error(JSON.stringify({ b, d }));
});
await rechaza('el visto bueno de stock no lo da Ventas', `select comercial.verificar_stock_pedido('${p1}', true)`, /encargada de Calle 5/);

await como('silveira@x');
await rechaza('si no hay, la encargada escribe qué falta', `select comercial.verificar_stock_pedido('${p1}', false)`, /qué falta/);
await prueba('la encargada da el visto bueno de stock', async () => {
  await q(`select comercial.verificar_stock_pedido($1, true, 'contado')`, [p1]);
  const f = await fila(p1);
  if (f.stock_ok !== true || f.stock_nota !== 'contado' || !f.stock_ok_en) throw new Error(JSON.stringify(f));
});
const armado = JSON.stringify([{ producto_id: pack, cantidad: 5 }, { producto_id: mono, cantidad: 20 }]);
await rechaza('si manda distinto de lo pendiente, «Enviado» pide el motivo', `select comercial.enviar_armado('${p1}', '${armado}'::jsonb)`, /escribí por qué/);
await prueba('«Enviado» con motivo: sale lo que hay y queda lo que se pedía y lo que salió', async () => {
  await q(`select comercial.enviar_armado($1, $2::jsonb, 'lo demás lo produce Producción')`, [p1, armado]);
  await imm();
  const f = await fila(p1);
  const dif = await q(`select producto_id, pendiente, enviado, motivo from comercial.despacho_diferencias where pedido_id=$1`, [p1]);
  // La auditoría la lee la supervisión, no la encargada (RLS): se mira como dueño.
  await db.exec('reset role');
  const aud = await uno(`select count(*)::int n from core.auditoria where tabla='despacho_diferencias'`);
  await como('silveira@x');
  if (N(f.pendiente) !== 50 || N(f.despachado) !== 25 || dif.length !== 1 || dif[0].producto_id !== mono
      || N(dif[0].pendiente) !== 70 || N(dif[0].enviado) !== 20 || aud.n !== 1) throw new Error(JSON.stringify({ f, dif, aud }));
});
await como('mati@x');
await prueba('la factura de una venta toma lo despachado, no lo pedido', async () => {
  const x = await uno(`select comercial.preparar_factura($1) j`, [p1]);
  const fac = await uno(`select importe_neto from comercial.facturas where pedido_id=$1 and comprobante='FACTURA'`, [p1]);
  const esperado = await uno(`select round(5 * (select precio_unitario from comercial.pedido_renglones where pedido_id=$1 and producto_id=$2 and not anulado)
     + 20 * (select precio_unitario from comercial.pedido_renglones where pedido_id=$1 and producto_id=$3 and not anulado), 2) n`, [p1, pack, mono]);
  if (!x.j || N(fac.importe_neto) !== N(esperado.n)) throw new Error(JSON.stringify({ fac, esperado }));
});
await como('silveira@x');

await como('naza@x');
await prueba('lo que Producción termina en Calle 5 para la venta queda reservado para ella', async () => {
  const s = await uno(`select id from comercial.pedidos where para_pedido_id=$1`, [p1]);
  // El material de la receta no está cargado en el banco: consumo 0 con motivo.
  const cons = (await q(`select insumo_id from comercial.necesidad_pedido($1)`, [s.id]))
    .map((x) => ({ insumo_id: x.insumo_id, cantidad: 0, motivo: 'prueba sin material' }));
  await q(`select comercial.terminar_pedido($1, $2::jsonb, $3::jsonb)`, [s.id, JSON.stringify(cons),
    JSON.stringify([{ producto_id: mono, cantidad: 50, deposito: 'C5' }])]);
  await imm();
  const res = await uno(`select sum(cantidad - consumido) n from comercial.reservas_pt where pedido_id=$1 and producto_id=$2 and not liberada`, [p1, mono]);
  if (N(res.n) !== 50) throw new Error(JSON.stringify(res));
});

await como('silveira@x');
await prueba('despachado lo que faltaba (igual a lo pendiente, sin motivo), el pedido queda entregado', async () => {
  await q(`select comercial.enviar_armado($1, $2::jsonb)`, [p1, JSON.stringify([{ producto_id: mono, cantidad: 50 }])]);
  await imm();
  const p = await uno(`select estado, entregado_en from comercial.pedidos where id=$1`, [p1]);
  if (p.estado !== 'CUMPLIDO' || !p.entregado_en) throw new Error(JSON.stringify(p));
});
await como('mati@x');
await prueba('en un pedido entregado todavía se marca el pago', async () => {
  await q(`update comercial.pedidos set estado_pago='PAGO', forma_pago='Efectivo' where id=$1`, [p1]);
  const f = await fila(p1);
  if (f.estado_pago !== 'PAGO' || f.forma_pago !== 'Efectivo') throw new Error(JSON.stringify(f));
});
await rechaza('pero nada más se toca', `update comercial.pedidos set destino_envio='otro' where id='${p1}'`, /cerrado/);
await prueba('la escala que rige es la última con vigencia empezada', async () => {
  await q(`insert into comercial.escalas_descuento (carga, desde_monto, porcentaje, vigente_desde) values (2, 0, 0, current_date + 30), (2, 100, 50, current_date + 30)`);
  const a = await uno(`select comercial.descuento_por_monto(700000) n`);
  if (N(a.n) !== 20) throw new Error(JSON.stringify(a));
});
await rechaza('una escala nueva empieza en $0', `select comercial.cargar_escala_descuento('[{"desde_monto":1000,"porcentaje":10}]'::jsonb)`, /empieza en \$0/);
await prueba('Ventas carga una escala nueva y rige desde hoy; la anterior queda', async () => {
  const c = await uno(`select comercial.cargar_escala_descuento($1::jsonb) n`, [JSON.stringify([{ desde_monto: 0, porcentaje: 0 }, { desde_monto: 500000, porcentaje: 22 }])]);
  const a = await uno(`select comercial.descuento_por_monto(700000) n`);
  const viejas = await uno(`select count(distinct carga)::int n from comercial.escalas_descuento`);
  if (N(a.n) !== 22 || viejas.n !== c.n) throw new Error(JSON.stringify({ c, a, viejas }));
});
await rechaza('un pedido enviado no se vuelve a enviar', `select comercial.enviar_venta('${p1}')`, /ya se envió/);
const comun = (await uno(`insert into comercial.pedidos (numero, cliente) values ('P-9','x') returning id`)).id;
await rechaza('solo se envían pedidos de venta', `select comercial.enviar_venta('${comun}')`, /No es un pedido de venta/);
await como('silveira@x');
await rechaza('la encargada de stock no cambia la escala', `select comercial.cargar_escala_descuento('[{"desde_monto":0,"porcentaje":0}]'::jsonb)`, /la cambia Ventas/);
await rechaza('la encargada de stock no envía ventas', `select comercial.enviar_venta('${p2}')`, /de Ventas/);

await invariantes();
fin();
