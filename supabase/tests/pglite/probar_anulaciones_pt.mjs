// Anulaciones de producto terminado (20261016130000): no son una puerta lateral a RN-51.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const duo = (await uno(`select id from gmp.productos where codigo_interno='DUO01'`)).id;
const f = (await uno(`insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`, [duo])).id;
await como('naza@x');
const p = (await uno(`insert into comercial.pedidos (numero, cliente) values ('P-1','Ana') returning id`)).id;
await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,4,1)`, [p, duo]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [p]);
const o = (await uno(`insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,1,1) returning id`, [f, duo])).id;
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [p, o]);
await q(`select comercial.terminar_pedido($1)`, [p]);
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
const entrada = (await uno(`select id from comercial.movimientos_pt where orden_id=$1 and tipo='ENTRADA_PRODUCCION'`, [o])).id;
const ins = (tipo, cant, anula, extra = '') =>
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, anula_a_movimiento_id, documento_tipo, documento_id)
   values ('${duo}','${PTF}','${tipo}',${cant},'corrección',${anula ? `'${anula}'` : 'null'},'PEDIDO','${p}')`;
await como('mati@x');
await rechaza('una venta disfrazada de anulación no saca un lote retenido (RN-51)', ins('SALIDA_VENTA', -4, entrada), /no una venta/);
await rechaza('la anulación es exactamente el opuesto', ins('SALIDA_AJUSTE', -1, entrada), /opuesto/);
await rechaza('anular algo que no existe', ins('SALIDA_AJUSTE', -4, '00000000-0000-0000-0000-000000000000'), /no existe/);
let anul;
await prueba('la anulación legítima: ajuste opuesto, sobre el mismo lote', async () => {
  anul = (await uno(ins('SALIDA_AJUSTE', -4, entrada) + ' returning id, orden_id')).id;
  const m = await uno(`select orden_id from comercial.movimientos_pt where id=$1`, [anul]);
  if (m.orden_id !== o) throw new Error(JSON.stringify(m));
});
await rechaza('no se anula una anulación', ins('ENTRADA_AJUSTE', 4, anul), /anulación/);
await rechaza('ni se anula dos veces lo mismo', ins('SALIDA_AJUSTE', -4, entrada), /duplicate|unique|no se registran más/);
await invariantes();
fin();
