// Ventas registra y anula cobros de la cuenta corriente de clientes
// (20261026160200, D-clientes-cc-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('op@x', 'PRODUCCION');

await como('diego@x');
const caja = (
  await uno(
    `insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja','CAJA') returning id`,
  )
).id;
const cli = (
  await uno(
    `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Ana','CONSUMIDOR_FINAL','DNI','30111222') returning id`,
  )
).id;
await db.exec('reset role');
const ped = (
  await uno(
    `insert into comercial.pedidos (numero, cliente, cliente_id, creado_por) values ('F-1','Ana',$1,(select id from core.usuarios where email='diego@x')) returning id`,
    [cli],
  )
).id;
const prod = (
  await uno(`select id from gmp.productos where activo order by codigo_interno limit 1`)
).id;
await q(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,1,1000)`,
  [ped, prod],
);
const fac = (
  await uno(
    `insert into comercial.facturas (pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta, numero, fecha, receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva, importe_neto, importe_iva, importe_total, alicuotas, estado, cae, cae_vencimiento, respuesta_arca, resuelta_en, emitida_por)
     values ($1,$2,'PRODUCCION','20409378472','B',6,1,1,current_date,96,'30111222',5,1000,0,1000,'[]','AUTORIZADA','12345678901234',current_date+10,'{}',now(),(select id from core.usuarios where email='diego@x')) returning id`,
    [ped, cli],
  )
).id;

await como('mati@x');
await prueba('Mati ve las cajas para elegir dónde entra', async () => {
  const c = await uno(
    `select count(*)::int n from comercial.cuentas_fondos where id = $1`,
    [caja],
  );
  if (c.n !== 1) throw new Error('no la ve');
});
let cobro;
await prueba('Mati registra un cobro imputado a la factura', async () => {
  cobro = (
    await uno(
      `select comercial.registrar_cobro_cliente($1,$2,400,'EFECTIVO',$3::jsonb) id`,
      [cli, caja, JSON.stringify([{ factura_id: fac, importe: 400 }])],
    )
  ).id;
  const s = await uno(
    `select saldo from comercial.v_saldos_clientes where cliente_id = $1`,
    [cli],
  );
  if (Number(s.saldo) !== 600) throw new Error(`saldo ${s.saldo}`);
});
await prueba(
  'el movimiento de caja se asienta aunque Mati no escriba fondos',
  async () => {
    await db.exec('reset role');
    const m = await uno(
      `select count(*)::int n, sum(importe)::numeric s from comercial.movimientos_fondos where cobro_id = $1`,
      [cobro],
    );
    if (m.n !== 1 || Number(m.s) !== 400) throw new Error(JSON.stringify(m));
  },
);
await como('mati@x');
await rechaza(
  'pero no escribe movimientos de fondos sueltos',
  `insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto) values ('${caja}', 'INGRESO', 1, 'x')`,
  /row-level security/,
);
await prueba('y lo anula con motivo', async () => {
  await q(`select comercial.anular_cobro_cliente($1,'se cargó dos veces')`, [cobro]);
  const s = await uno(
    `select saldo from comercial.v_saldos_clientes where cliente_id = $1`,
    [cli],
  );
  if (Number(s.saldo) !== 1000) throw new Error(`saldo ${s.saldo}`);
});
await como('op@x');
await rechaza(
  'Producción no cobra',
  `select comercial.registrar_cobro_cliente('${cli}','${caja}',100,'EFECTIVO','[]'::jsonb)`,
  /row-level security|permiso|no puede/i,
);
await invariantes();
fin();
