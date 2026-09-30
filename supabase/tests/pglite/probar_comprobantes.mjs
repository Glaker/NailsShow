import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('oper@x', 'OPERARIO');
await usuario('cc@x', 'CONTROL_CALIDAD');
await usuario('stock@x', 'ENCARGADA_STOCK', 'DEPOSITO');
await como('naza@x');
const prov = (await uno(`insert into gmp.proveedores (razon_social) values ('Prov X') returning id`)).id;
const prov2 = (await uno(`insert into gmp.proveedores (razon_social) values ('Prov Y') returning id`)).id;
const rec = (await uno(`insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1,'R1',true) returning id`, [prov])).id;
const ins = (s, p) => uno(`insert into comercial.comprobantes_proveedor ${s} returning *`, p);
let fa;
await prueba('factura A con IVA discriminado y recepción', async () => {
  fa = await ins(`(proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_otros, importe_total) values ($1,$2,'FACTURA_A',3,1234,1000,210,15,1225)`, [prov, rec]);
  if (!fa.registrado_por) throw new Error('sin autor');
});
fa = await ins(`(proveedor_id, recepcion_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ($1,$2,'FACTURA_A',3,1235,100,21,121)`, [prov, rec]);
await prueba('sin factura: solo remito, sin número, total opcional', async () => {
  await ins(`(proveedor_id, recepcion_id, tipo) values ($1,$2,'SIN_FACTURA')`, [prov, rec]);
  await ins(`(proveedor_id, recepcion_id, tipo, importe_total) values ($1,$2,'SIN_FACTURA', 5000)`, [prov, rec]);
});
await prueba('factura B: solo total', async () => { await ins(`(proveedor_id, tipo, punto_venta, numero, importe_total) values ($1,'FACTURA_B',1,9,500)`, [prov]); });
await rechaza('A con total que no cierra', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ('${prov}','FACTURA_A',1,77,100,21,120)`, /iva_discriminado/);
await rechaza('B con IVA discriminado', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_iva, importe_total) values ('${prov}','FACTURA_B',1,78,21,121)`, /iva_discriminado/);
await rechaza('sin factura con IVA', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, importe_iva) values ('${prov}','SIN_FACTURA',21)`, /iva_discriminado/);
await rechaza('sin factura con número', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero) values ('${prov}','SIN_FACTURA',1,2)`, /numerado/);
await rechaza('factura sin número', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, importe_total) values ('${prov}','FACTURA_C',10)`, /numerado/);
await rechaza('duplicada', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ('${prov}','FACTURA_A',3,1234,1,0,1)`, /unico|duplicate/);
await rechaza('proveedor distinto al de la recepción', `insert into comercial.comprobantes_proveedor (proveedor_id, recepcion_id, tipo) values ('${prov2}','${rec}','SIN_FACTURA')`, /otro proveedor/);
await prueba('NC A sobre factura A', async () => { await ins(`(proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total, comprobante_asociado_id) values ($1,'NOTA_CREDITO_A',3,5,10,2.1,12.1,$2)`, [prov, fa.id]); });
await rechaza('NC sin factura asociada', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_total) values ('${prov}','NOTA_CREDITO_B',3,6,10)`, /nc_asociada/);
await rechaza('NC B sobre factura A', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, importe_total, comprobante_asociado_id) values ('${prov}','NOTA_CREDITO_B',3,7,10,'${fa.id}')`, /misma clase/);
await rechaza('no se edita', `update comercial.comprobantes_proveedor set importe_total = 1 where id = '${fa.id}'`, /no se edita/);
await rechaza('no se borra', `delete from comercial.comprobantes_proveedor where id = '${fa.id}'`, /permission|denied|rechaz|DELETE/i);
await prueba('se anula con motivo, a nombre de quien anula', async () => {
  await q(`select comercial.anular_comprobante_proveedor($1, 'número mal cargado')`, [fa.id]);
  const a = await uno(`select anulado_en, anulado_por, motivo_anulacion from comercial.comprobantes_proveedor where id=$1`, [fa.id]);
  if (!a.anulado_en || !a.anulado_por) throw new Error(JSON.stringify(a));
});
await rechaza('anular sin motivo', `select comercial.anular_comprobante_proveedor((select id from comercial.comprobantes_proveedor where tipo='FACTURA_B' limit 1), ' ')`, /anulacion/);
await rechaza('no se anula dos veces', `select comercial.anular_comprobante_proveedor('${fa.id}', 'otra vez')`, /ya está anulado/);
await prueba('anulada: se puede recargar el mismo número', async () => { await ins(`(proveedor_id, tipo, punto_venta, numero, importe_neto, importe_iva, importe_total) values ($1,'FACTURA_A',3,1235,100,21,121)`, [prov]); });
await como('oper@x');
await prueba('operario que recibe puede cargarlo', async () => { await ins(`(proveedor_id, recepcion_id, tipo) values ($1,$2,'SIN_FACTURA')`, [prov, rec]); });
await rechaza('operario no anula', `select comercial.anular_comprobante_proveedor((select id from comercial.comprobantes_proveedor where tipo='FACTURA_B' limit 1), 'x')`, /no existe o tu rol/);
await como('stock@x');
await rechaza('encargada de stock no carga', `insert into comercial.comprobantes_proveedor (proveedor_id, tipo) values ('${prov}','SIN_FACTURA')`, /row-level|política|policy/i);
await prueba('lo ve cualquier rol, también sin factura', async () => {
  const n = await uno(`select count(*) filter (where tipo='SIN_FACTURA')::int n from comercial.comprobantes_proveedor`);
  if (n.n < 3) throw new Error(String(n.n));
});
await prueba('auditoría registrada', async () => {
  await db.exec('reset role');
  const n = await uno(`select count(*)::int n from core.auditoria where tabla = 'comprobantes_proveedor'`);
  if (n.n < 5) throw new Error(String(n.n));
});
await invariantes();
fin();
