import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
const NAZA = 'corporativo.nailshow@gmail.com';
await db.exec(`update core.usuarios set rol='GERENCIA_PRODUCCION' where email='${NAZA}'`);
await usuario('silveira@x', 'ENCARGADA_STOCK', 'DEPOSITO');
await usuario('op@x', 'OPERARIO');
await como(NAZA);
const imm = () => db.exec('set constraints all immediate; set constraints all deferred');
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const c5 = (await uno(`select id from gmp.depositos where numero='C5'`)).id;
const ptf = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
const fila = async () => (await uno(`select * from comercial.v_calle5 where producto_id=$1`, [duo])) ?? {};
const N = (x) => Number(x ?? 0);
const cli = async (nom, dni) => (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ($1,'CONSUMIDOR_FINAL','DNI',$2) returning id`, [nom, dni])).id;
const cA = await cli('Ana', '30111222'), cB = await cli('Beto', '30111223'), cC = await cli('Caro', '30111224');
let nped = 0;
const pedido = async (clienteId, cant) => {
  const p = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ($1,'cli',$2) returning id`, [`P-${++nped}`, clienteId])).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`, [p, duo, cant]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
  return p;
};
const desp = (p, cant, extra = {}) => q(`select comercial.despachar_pedido($1, $2::jsonb, $3, $4) id`, [p, JSON.stringify([{ producto_id: duo, cantidad: cant }]), extra.dep ?? 'C5', extra.faltantes ?? false]);

await q(`select comercial.registrar_conteo_pt($1, 100, 'inicial', 'C5')`, [duo]);
const pA = await pedido(cA, 400), pB = await pedido(cB, 300), pC = await pedido(cC, 300);
await prueba('la demanda se suma: 1000 pedidas, 100 en C5, faltan 900', async () => {
  const f = await fila();
  if (N(f.en_calle5) !== 100 || N(f.pendiente) !== 1000 || N(f.falta_producir) !== 900 || N(f.pedidos) !== 3) throw new Error(JSON.stringify(f));
});
await prueba('el sistema no asigna: nada reservado sin que una persona lo decida', async () => {
  const n = await uno(`select count(*)::int n from comercial.reservas_pt`);
  if (n.n !== 0) throw new Error(String(n.n));
});
let resB;
await como('silveira@x');
await prueba('Silveira reserva 60 para el pedido de Beto y 30 para Caro (cliente)', async () => {
  resB = await uno(`insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,60) returning id, cliente_id`, [duo, c5, pB]);
  if (resB.cliente_id !== cB) throw new Error('no heredó el cliente');
  await q(`insert into comercial.reservas_pt (producto_id, deposito_id, cliente_id, cantidad) values ($1,$2,$3,30)`, [duo, c5, cC]);
  await imm();
  const f = await fila();
  if (N(f.reservado) !== 90 || N(f.libre) !== 10) throw new Error(JSON.stringify(f));
});
await rechaza('no se reserva más de lo libre', `insert into comercial.reservas_pt (producto_id, deposito_id, cliente_id, cantidad) values ('${duo}','${c5}','${cA}',11)`, /no se puede reservar más/);
await rechaza('reserva para el pedido de otro cliente', `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cliente_id, cantidad) values ('${duo}','${c5}','${pA}','${cB}',1)`, /otro cliente/);
await rechaza('Ana no se lleva lo reservado para otros', `select comercial.despachar_pedido('${pA}', '[{"producto_id":"${duo}","cantidad":11}]', 'C5', true)`, /reservado para otro/);
await rechaza('«completo» con pendientes', `select comercial.despachar_pedido('${pA}', '[{"producto_id":"${duo}","cantidad":10}]', 'C5', false)`, /con faltantes/);
await prueba('Ana: despacho con faltantes de lo libre (10), el resto queda pendiente', async () => {
  await desp(pA, 10, { faltantes: true }); await imm();
  const v = await uno(`select despachado, pendiente from comercial.v_pendientes_despacho where pedido_id=$1`, [pA]);
  const p = await uno(`select entregado_en from comercial.pedidos where id=$1`, [pA]);
  if (N(v.despachado) !== 10 || N(v.pendiente) !== 390 || p.entregado_en) throw new Error(JSON.stringify(v));
  const d = await uno(`select con_faltantes from comercial.despachos_pt where pedido_id=$1`, [pA]);
  if (!d.con_faltantes) throw new Error('marca');
  const m = await uno(`select count(*)::int n from comercial.movimientos_pt where despacho_id is not null`);
  if (m.n !== 1) throw new Error('movimiento sin despacho');
});
await prueba('Beto usa la reserva de su pedido', async () => {
  await desp(pB, 60, { faltantes: true }); await imm();
  const r = await uno(`select consumido from comercial.reservas_pt where id=$1`, [resB.id]);
  if (N(r.consumido) !== 60) throw new Error(JSON.stringify(r));
  if (N((await fila()).en_calle5) !== 30) throw new Error('saldo');
});
await prueba('Caro usa la reserva de cliente', async () => {
  await desp(pC, 30, { faltantes: true }); await imm();
  const f = await fila();
  if (N(f.reservado) !== 0 || N(f.en_calle5) !== 0) throw new Error(JSON.stringify(f));
});
await rechaza('más de lo pendiente', `select comercial.despachar_pedido('${pC}', '[{"producto_id":"${duo}","cantidad":271}]', 'C5', true)`, /quedan 270/);
await rechaza('lo que no hay', `select comercial.despachar_pedido('${pC}', '[{"producto_id":"${duo}","cantidad":5}]', 'C5', true)`, /No se puede sacar|dejaría|reservado/);
await como(NAZA);
let s1;
await prueba('mandar a producir lo que falta con destino Calle 5: cuenta en producción', async () => {
  s1 = (await uno(`insert into comercial.pedidos (numero, cliente, para_stock, destino_deposito_id) values ('S-1','Para Calle 5', true, $1) returning id`, [c5])).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,900)`, [s1, duo]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [s1]);
  const f = await fila();
  if (N(f.en_produccion) !== 900 || N(f.falta_producir) !== 0) throw new Error(JSON.stringify(f));
});
await prueba('«Terminado» sin decir destino: va al sugerido (Calle 5)', async () => {
  await q(`select comercial.terminar_pedido($1)`, [s1]); await imm();
  const f = await fila();
  if (N(f.en_calle5) !== 900 || N(f.en_produccion) !== 0 || N(f.falta_producir) !== 0) throw new Error(JSON.stringify(f));
});
await prueba('producción para stock repartida: 5 a Calle 5 y 15 de seguridad en fábrica (más de lo pedido)', async () => {
  const s = (await uno(`insert into comercial.pedidos (numero, cliente, para_stock) values ('S-2','Stock', true) returning id`)).id;
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,10)`, [s, duo]);
  await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [s]);
  await q(`select comercial.terminar_pedido($1, '[]', $2::jsonb)`, [s, JSON.stringify([{ producto_id: duo, cantidad: 5, deposito: 'C5' }, { producto_id: duo, cantidad: 15, deposito: 'PTF' }])]);
  const f = await fila();
  if (N(f.en_calle5) !== 905 || N(f.en_fabrica) !== 15) throw new Error(JSON.stringify(f));
});
await prueba('pedido de cliente producido a Calle 5: queda reservado para él y se despacha', async () => {
  const cD = await cli('Dani', '30111225');
  const p = await pedido(cD, 20);
  await q(`select comercial.terminar_pedido($1, '[]', $2::jsonb)`, [p, JSON.stringify([{ producto_id: duo, cantidad: 25, deposito: 'C5' }])]);
  const r = await uno(`select sum(cantidad)::numeric c from comercial.reservas_pt where pedido_id=$1`, [p]);
  if (N(r.c) !== 20) throw new Error(JSON.stringify(r));
  await como('silveira@x');
  await desp(p, 20); await imm();
  const pe = await uno(`select estado, entregado_en from comercial.pedidos where id=$1`, [p]);
  if (pe.estado !== 'CUMPLIDO' || !pe.entregado_en) throw new Error(JSON.stringify(pe));
  await como(NAZA);
});
await prueba('pedido de cliente producido a fábrica: comprometido en SS y entrega desde PTF', async () => {
  const p = await pedido(cA, 3);
  await q(`select comercial.terminar_pedido($1)`, [p]);
  const ss = await uno(`select comprometido from comercial.v_stock_seguridad where producto_id=$1`, [duo]);
  if (N(ss.comprometido) !== 3) throw new Error(JSON.stringify(ss));
  await q(`select comercial.entregar_pedido($1)`, [p]); await imm();
  const ss2 = await uno(`select comprometido, en_fabrica from comercial.v_stock_seguridad where producto_id=$1`, [duo]);
  if (N(ss2.comprometido) !== 0 || N(ss2.en_fabrica) !== 15) throw new Error(JSON.stringify(ss2));
});
await rechaza('una entrada de producción suelta no vale', `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, documento_tipo, documento_id) values ('${duo}','${ptf}','ENTRADA_PRODUCCION',1,'PEDIDO','${s1}')`, /Terminado/);
const pDest = await pedido(cB, 1);
await rechaza('destino inválido', `select comercial.terminar_pedido('${pDest}', '[]', '[{"producto_id":"${duo}","cantidad":1,"deposito":"APE"}]')`, /PTF|C5|termina/);
await prueba('transferir stock de seguridad a Calle 5', async () => {
  await q(`select comercial.transferir_pt($1, 5, 'PTF', 'C5')`, [duo]); await imm();
  const f = await fila();
  if (N(f.en_fabrica) !== 10) throw new Error(JSON.stringify(f));
});
await prueba('Ana se completa: queda entregada', async () => {
  await como('silveira@x');
  await desp(pA, 390); await imm();
  const pe = await uno(`select entregado_en from comercial.pedidos where id=$1`, [pA]);
  if (!pe.entregado_en) throw new Error('no entregado');
});
await prueba('liberar una reserva con motivo', async () => {
  const r = (await uno(`insert into comercial.reservas_pt (producto_id, deposito_id, cliente_id, cantidad) values ($1,$2,$3,1) returning id`, [duo, c5, cC])).id;
  await q(`select comercial.liberar_reserva_pt($1, 'ya no la quiere')`, [r]); await imm();
});
await rechaza('una reserva no se edita', `update comercial.reservas_pt set cantidad = 99 where id='${resB.id}'`, /no se edita/);
await rechaza('una reserva no se borra', `delete from comercial.reservas_pt where id='${resB.id}'`, /permission|denied/);
await como('op@x');
await rechaza('un operario no despacha', `select comercial.despachar_pedido('${pB}', '[{"producto_id":"${duo}","cantidad":1}]', 'C5', true)`, /no despacha/);
await rechaza('un operario no reserva', `insert into comercial.reservas_pt (producto_id, deposito_id, cliente_id, cantidad) values ('${duo}','${c5}','${cA}',1)`, /row-level/);
await invariantes();
fin();
