import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('gg@x', 'GERENCIA', 'ADMINISTRACION');
const N = (x) => Number(x ?? 0);

// CUIT válido (dígito verificador módulo 11) para el segundo emisor.
const cuit = (base) => {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const dv = 11 - ([...base].reduce((a, d, i) => a + Number(d) * w[i], 0) % 11);
  return base + (dv === 11 ? 0 : dv === 10 ? 9 : dv);
};
const CUIT_MONO = cuit('2712345678');

// Respuesta de ARCA simulada: el circuito real se prueba en homologación.
const autorizar = async (id, numero) => {
  await q(`select comercial.fijar_numero_factura($1, $2)`, [id, numero]);
  const r = { FECAESolicitarResult: { FeCabResp: { Resultado: 'A' }, FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '12345678901234', CAEFchVto: '20261031' }] } } };
  return uno(`select comercial.registrar_resultado_factura($1, '{}'::jsonb, $2::jsonb) r`, [id, JSON.stringify(r)]);
};

await como('gg@x');
const monotributo = (await uno(`insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, razon_social, condicion_iva)
  values ('HOMOLOGACION', $1, 2, 'Virginia Arleo (prueba)', 'MONOTRIBUTO') returning id`, [CUIT_MONO])).id;
const ri = (await uno(`select id from comercial.configuracion_fiscal where vigente and condicion_iva='RESPONSABLE_INSCRIPTO'`)).id;
await rechaza('los emisores vigentes van todos en el mismo ambiente',
  `insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, razon_social, condicion_iva) values ('PRODUCCION','${cuit('3012345678')}',3,'Athene','RESPONSABLE_INSCRIPTO')`, /mismo ambiente/);

await como('diego@x');
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Ana','CONSUMIDOR_FINAL','DNI','30111222') returning id`)).id;
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-NC','Ana',$1) returning id`, [cli])).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,10,1000)`, [ped, duo]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);

await rechaza('con dos emisores vigentes hay que elegir', `select comercial.preparar_factura('${ped}')`, /elegí a nombre de quién/);

let fac;
await prueba('emisor Responsable Inscripto a consumidor final: Factura B', async () => {
  const f = (await uno(`select comercial.preparar_factura($1, $2) f`, [ped, ri])).f;
  if (f.tipo !== 'B' || f.codigo_arca !== 6 || f.comprobante !== 'FACTURA' || N(f.importe_total) !== 12100 || f.asociado !== null) throw new Error(JSON.stringify(f));
  fac = f.factura_id;
  await autorizar(fac, 1);
});
await rechaza('facturado y sin anular, no se refactura', `select comercial.preparar_factura('${ped}', '${ri}')`, /nota de crédito/);
await rechaza('la NC pide motivo', `select comercial.preparar_nota_credito('${fac}', ' ')`, /por qué/);

const banco1 = (await uno(`insert into comercial.cuentas_fondos (nombre, tipo) values ('Galicia','BANCO') returning id`)).id;
await prueba('se cobra una parte antes de anular', async () => {
  await q(`select comercial.registrar_cobro_cliente($1,$2,2100,'TRANSFERENCIA',$3::jsonb)`, [cli, banco1, JSON.stringify([{ factura_id: fac, importe: 2100 }])]);
});

let nc;
await prueba('la NC copia la factura: B → código 8, con el comprobante asociado', async () => {
  const f = (await uno(`select comercial.preparar_nota_credito($1, 'Cliente equivocado') f`, [fac])).f;
  if (f.codigo_arca !== 8 || f.comprobante !== 'NOTA_CREDITO' || N(f.importe_total) !== 12100
      || f.asociado?.numero !== 1 || f.asociado?.codigo_arca !== 6 || f.punto_venta !== 1) throw new Error(JSON.stringify(f));
  nc = f.factura_id;
});
await prueba('reintento: devuelve la misma NC pendiente', async () => {
  const f = (await uno(`select comercial.preparar_nota_credito($1, 'otra vez') f`, [fac])).f;
  if (f.factura_id !== nc) throw new Error('otra NC');
});
await prueba('autorizada la NC, la factura no debe nada y queda saldo a favor', async () => {
  await autorizar(nc, 1);
  const p = await uno(`select pendiente, acreditado from comercial.v_facturas_pendientes_cobro where factura_id=$1`, [fac]);
  if (N(p.pendiente) !== 0 || N(p.acreditado) !== 12100) throw new Error(JSON.stringify(p));
  const cc = await q(`select movimiento, debe, haber from comercial.v_cuenta_corriente_clientes where cliente_id=$1 order by momento`, [cli]);
  const saldo = cc.reduce((a, m) => a + N(m.debe) - N(m.haber), 0);
  if (!cc.some((m) => m.movimiento === 'NOTA_CREDITO') || saldo !== -2100) throw new Error(JSON.stringify(cc));
  const v = await uno(`select sum(total) t, sum(facturas) n from comercial.v_ventas_mensuales where cliente_id=$1`, [cli]);
  if (N(v.t) !== 0 || N(v.n) !== 1) throw new Error(JSON.stringify(v));
});
await rechaza('una factura se anula una sola vez', `select comercial.preparar_nota_credito('${fac}', 'de nuevo')`, /ya tiene una nota de crédito/);
await rechaza('una NC no se anula', `select comercial.preparar_nota_credito('${nc}', 'x')`, /no se anula con otra/);
await rechaza('a una NC no se le imputa un cobro', `select comercial.registrar_cobro_cliente('${cli}','${banco1}',10,'EFECTIVO','[{"factura_id":"${nc}","importe":10}]'::jsonb)`, /nota de crédito/);

let facC;
await prueba('anulada, se refactura a nombre del monotributista: Factura C sin IVA discriminado', async () => {
  const f = (await uno(`select comercial.preparar_factura($1, $2) f`, [ped, monotributo])).f;
  if (f.tipo !== 'C' || f.codigo_arca !== 11 || N(f.importe_iva) !== 0 || N(f.importe_neto) !== 12100
      || N(f.importe_total) !== 12100 || f.alicuotas.length !== 0 || f.cuit_emisor !== CUIT_MONO || f.punto_venta !== 2) throw new Error(JSON.stringify(f));
  facC = f.factura_id;
  await autorizar(facC, 1);
});
await prueba('la NC de una C es código 13', async () => {
  const f = (await uno(`select comercial.preparar_nota_credito($1, 'prueba') f`, [facC])).f;
  if (f.codigo_arca !== 13 || f.tipo !== 'C') throw new Error(JSON.stringify(f));
});
const ped2 = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-NC2','Ana',$1) returning id`, [cli])).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,1,1000)`, [ped2, duo]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped2]);
await rechaza('un emisor no vigente no factura', `select comercial.preparar_factura('${ped2}', gen_random_uuid())`, /no está vigente/);
await como('gg@x');
await rechaza('la condición del emisor es RI, Monotributo o Exento', `update comercial.configuracion_fiscal set condicion_iva='CONSUMIDOR_FINAL' where id='${monotributo}'`, /condicion_emisor|row-level/);

await db.exec('reset role');
await rechaza('la NC autorizada no se toca', `update comercial.facturas set motivo='otro' where id='${nc}'`, /RN-56/);

await invariantes();
fin();
