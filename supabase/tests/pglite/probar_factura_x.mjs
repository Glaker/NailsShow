// La factura X es lo que salió de verdad (20261118180100, D-factura-x-1):
// DESPACHO la carga, el stock baja por lo facturado, lo reservado que no
// salió se libera, y los SKU en negativo se cuentan.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS');
await usuario('johana@x', 'DESPACHO');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const [p101, p102, p103, p105] = [
  await prod('101'),
  await prod('102'),
  await prod('103'),
  await prod('105'),
];
const BER = (await uno(`select id from gmp.depositos where numero='BER'`)).id;

await db.exec('reset role');
await db.exec('set session_replication_role = replica');
for (const [p, c] of [
  [p101, 10],
  [p102, 2],
])
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',$3,'stock de prueba',(select id from core.usuarios where email='naza@x'))`,
    [p, BER, c],
  );
await db.exec('set session_replication_role = origin');

const saldo = async (p) =>
  N(
    (
      await uno(
        `select sum(cantidad) s from comercial.movimientos_pt where producto_id=$1 and deposito_id=$2`,
        [p, BER],
      )
    ).s,
  );
const pedido = async (numero, renglones) => {
  const v = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta, deposito_origen_id) values ($1,'XUEFEN LIN',true,$2) returning id`,
      [numero, BER],
    )
  ).id;
  for (const [p, c] of renglones)
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
      [v, p, c],
    );
  return v;
};
const factura = (numero, renglones) =>
  JSON.stringify({
    numero,
    fecha: '2026-11-18',
    cliente: 'XUEFEN LIN',
    total: 1000,
    renglones: renglones.map(([codigo, cantidad]) => ({ codigo, cantidad, descripcion: codigo })),
  });

await como('mati@x');
// Otro cliente tiene 1 de 101 reservado: la factura igual descuenta.
const otro = await pedido('V-OTRO', [[p101, 1]]);
await q(
  `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,1)`,
  [p101, BER, otro],
);
const v = await pedido('V-X1', [
  [p101, 5],
  [p102, 3],
  [p103, 4],
]);
await como('johana@x');
await rechaza(
  'sin aprobar no se carga la factura',
  `select comercial.cargar_factura_x('${v}', '${factura('X-1', [['101', 4]])}'::jsonb)`,
  /aprobado/,
);
await rechaza(
  'Despacho no aprueba pedidos',
  `select comercial.aprobar_venta_con_faltantes('${v}', 'x')`,
  /Ventas/,
);
await como('mati@x');
await q(`select comercial.aprobar_venta_con_faltantes($1, 'sale lo que hay')`, [v]);
await prueba('al aprobar el stock real no baja: solo se reserva', async () => {
  if ((await saldo(p101)) !== 10) throw new Error(String(await saldo(p101)));
});

await como('johana@x');
let resultado;
await prueba('Johana carga la factura X: baja lo facturado, aunque quede negativo', async () => {
  // 101: 4 de 5; 102: 3 (el sistema tiene 2); 105 no estaba en el pedido; ZZZ no existe.
  resultado = (
    await uno(`select comercial.cargar_factura_x($1, $2::jsonb) j`, [
      v,
      factura('X-1', [
        ['101', 4],
        ['102', 3],
        ['105', 2],
        ['ZZZ', 1],
      ]),
    ])
  ).j;
  if ((await saldo(p101)) !== 6) throw new Error('101 ' + (await saldo(p101)));
  if ((await saldo(p102)) !== -1) throw new Error('102 ' + (await saldo(p102)));
  if ((await saldo(p105)) !== -2) throw new Error('105 ' + (await saldo(p105)));
  const neg = resultado.negativos.map((x) => x.codigo).join(',');
  if (neg !== '102,105') throw new Error('negativos ' + neg);
  if (resultado.sin_catalogo !== 'ZZZ') throw new Error('sin catálogo ' + resultado.sin_catalogo);
});
await prueba('lo reservado que no salió se libera y el pedido queda entregado', async () => {
  const r = await uno(
    `select count(*) n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [v],
  );
  if (N(r.n) !== 0) throw new Error('quedan reservas');
  const p = await uno(`select estado, entregado_en from comercial.pedidos where id=$1`, [v]);
  if (p.estado !== 'CUMPLIDO' || !p.entregado_en) throw new Error(JSON.stringify(p));
  const o = await uno(
    `select count(*) n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [otro],
  );
  if (N(o.n) !== 1) throw new Error('se tocó la reserva de otro');
});
await rechaza(
  'la misma factura no se carga dos veces',
  `select comercial.cargar_factura_x('${v}', '${factura('X-1', [['101', 1]])}'::jsonb)`,
  /ya está cargada/,
);
await rechaza(
  'Johana no cuenta un SKU que no está en negativo',
  `select comercial.cargar_conteo_pt('${BER}', '[{"producto_id":"${p101}","cantidad":3}]'::jsonb)`,
  /negativo/,
);
await prueba('Johana carga el conteo de los SKU en negativo', async () => {
  await q(`select comercial.cargar_conteo_pt($1, $2::jsonb)`, [
    BER,
    JSON.stringify([
      { producto_id: p102, cantidad: 0 },
      { producto_id: p105, cantidad: 5 },
    ]),
  ]);
  if ((await saldo(p102)) !== 0) throw new Error('102 ' + (await saldo(p102)));
  if ((await saldo(p105)) !== 5) throw new Error('105 ' + (await saldo(p105)));
  const m = await uno(
    `select motivo from comercial.movimientos_pt where producto_id=$1 and documento_tipo='CONTEO_PT'`,
    [p105],
  );
  if (!/Conteo de BER .*\(Despacho, tras una factura X\): 5; el sistema tenía -2/.test(m.motivo))
    throw new Error(m.motivo);
});

// Nadie usa una factura vieja para saltarse los controles de stock.
const fx1 = (await uno(`select id from comercial.facturas_x where numero='X-1'`)).id;
const dx1 = (await uno(`select id from comercial.despachos_pt where factura_x_id=$1`, [fx1])).id;
await como('mati@x');
await rechaza(
  'Ventas no crea un despacho de factura X a mano',
  `insert into comercial.despachos_pt (pedido_id, deposito_id, factura_x_id) values ('${otro}', '${BER}', '${fx1}')`,
  /cargar_factura_x/,
);
await rechaza(
  'un movimiento que apunta a una factura vieja no deja stock negativo',
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
   values ('${p101}', '${BER}', 'SALIDA_AJUSTE', -500, 'intento', 'FACTURA_X', '${fx1}', '${dx1}')`,
  /no hay|stock|No alcanza/,
);

// «Despachado» primero no mueve stock; la factura después baja lo facturado.
await como('mati@x');
const w = await pedido('V-X2', [[p101, 3]]);
await q(
  `insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad) values ($1,$2,$3,3)`,
  [p101, BER, w],
);
await q(`select comercial.aprobar_venta_reservada($1)`, [w]);
await como('johana@x');
await prueba('Johana marca Despachado: el stock no se mueve', async () => {
  await q(`select comercial.despachar_pedido_reservado($1)`, [w]);
  if ((await saldo(p101)) !== 6) throw new Error('101 ' + (await saldo(p101)));
});
await prueba('la factura dice 2: bajan 2', async () => {
  await q(`select comercial.cargar_factura_x($1, $2::jsonb)`, [w, factura('X-2', [['101', 2]])]);
  if ((await saldo(p101)) !== 4) throw new Error('101 ' + (await saldo(p101)));
});

// Sin pedido: Educadores (J) y Minorista (B, C, X) salen de Berna (20261118193000).
const venta = (tipo, numero, canal, renglones) =>
  JSON.stringify({
    numero,
    tipo,
    canal,
    emisor_cuit: '27-30958059-7',
    fecha: '2026-11-14',
    cliente: 'MERCEDES PAINEQUEO',
    renglones: renglones.map(([codigo, cantidad]) => ({ codigo, cantidad, descripcion: codigo })),
  });
await prueba('factura J de Educadores: baja el stock de Berna y el envío no mueve nada', async () => {
  const antes = await saldo(p101);
  const r = (
    await uno(`select comercial.cargar_factura_venta($1::jsonb) j`, [
      venta('J', '0002-00004184', 'EDUCADORES', [
        ['101', 3],
        ['500', 1],
      ]),
    ])
  ).j;
  if ((await saldo(p101)) !== antes - 3) throw new Error('101 ' + (await saldo(p101)));
  if (r.sin_catalogo !== '500') throw new Error('sin catálogo ' + r.sin_catalogo);
});
await prueba('la misma numeración con otra letra es otra factura (minorista X)', async () => {
  const antes = await saldo(p101);
  await q(`select comercial.cargar_factura_venta($1::jsonb)`, [
    venta('X', '0002-00004184', 'MINORISTA', [['101', 1]]),
  ]);
  if ((await saldo(p101)) !== antes - 1) throw new Error('101 ' + (await saldo(p101)));
});
await rechaza(
  'la misma factura J no se carga dos veces',
  `select comercial.cargar_factura_venta('${venta('J', '0002-00004184', 'EDUCADORES', [['101', 1]])}'::jsonb)`,
  /ya está cargada/,
);
await rechaza(
  'sin pedido no hay factura mayorista',
  `select comercial.cargar_factura_venta('${venta('X', '0100-1', 'MAYORISTA', [['101', 1]])}'::jsonb)`,
  /Educadores o Minorista/,
);
await como('naza@x');
await rechaza(
  'Producción no carga facturas',
  `select comercial.cargar_factura_venta('${venta('C', '0003-1', 'MINORISTA', [['101', 1]])}'::jsonb)`,
  /Despacho, Ventas o Administración/,
);

await invariantes();
fin();
