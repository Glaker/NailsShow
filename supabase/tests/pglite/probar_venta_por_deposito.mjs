// El pedido de venta sale de Fábrica, Berna o Calle 5; Naza reserva al
// proponer fecha y, si reserva todo, queda aprobado (20261027130000,
// D-venta-deposito-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const prod = async (c) =>
  (await uno(`select id from gmp.productos where codigo_interno=$1`, [c])).id;
const dep = async (n) =>
  (await uno(`select id from gmp.depositos where numero=$1`, [n])).id;
const [p101, p102] = [await prod('101'), await prod('102')];
const [PTF, BER, C5] = [await dep('PTF'), await dep('BER'), await dep('C5')];

await prueba('la lista de fábrica reconoce las variantes de escritura', async () => {
  const r = await q(
    `select n, comercial.sale_de_fabrica(n) s from unnest(array[
       'BELLA CENTRAL', 'bella central', 'Bella Central (Depósito)', 'BELLA CENTRAL (LOCAL MITRE)',
       'CESAR CUEVA ( TAURO )', 'Cesar Cueva (Tauro)', 'Yessica Franchesca Contreras Duque',
       'Bella', 'VICTOR CUEVA']) n`,
  );
  const si = r.filter((x) => x.s).map((x) => x.n);
  if (si.length !== 7 || si.includes('Bella') || si.includes('VICTOR CUEVA'))
    throw new Error(JSON.stringify(r));
});

// Stock de producto terminado, como superusuario (el circuito de entrada se
// prueba en sus suites).
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
for (const [d, p, c] of [
  [PTF, p101, 30],
  [BER, p101, 10],
])
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',$3,'stock inicial de prueba',(select id from core.usuarios where email='naza@x'))`,
    [p, d, c],
  );
await db.exec('set session_replication_role = origin');

await como('mati@x');
const venta = async (numero, cliente, renglones) => {
  const id = (
    await uno(
      `insert into comercial.pedidos (numero, cliente, es_venta) values ($1,$2,true) returning id`,
      [numero, cliente],
    )
  ).id;
  for (const [p, c] of renglones)
    await q(
      `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad) values ($1,$2,$3)`,
      [id, p, c],
    );
  return id;
};
const origen = async (id) =>
  (
    await uno(
      `select d.numero from comercial.pedidos p join gmp.depositos d on d.id = p.deposito_origen_id where p.id=$1`,
      [id],
    )
  ).numero;
const estado = async (id) =>
  (await uno(`select estado from comercial.pedidos where id=$1`, [id])).estado;

const vBella = await venta('V-B', 'Bella Central (depósito)', [
  [p101, 20],
  [p102, 5],
]);
const vOtro = await venta('V-O', 'Kiosco Pepe', [[p101, 8]]);
const vC5 = await venta('V-C', 'Kiosco Pepe', [[p101, 1]]);
await prueba('Bella Central sale de fábrica y el resto de Berna', async () => {
  if ((await origen(vBella)) !== 'PTF' || (await origen(vOtro)) !== 'BER')
    throw new Error(`${await origen(vBella)} ${await origen(vOtro)}`);
});
await prueba('Mati lo cambia a Calle 5', async () => {
  await q(`update comercial.pedidos set deposito_origen_id=$1 where id=$2`, [C5, vC5]);
  if ((await origen(vC5)) !== 'C5') throw new Error(await origen(vC5));
});
await rechaza(
  'pero no a un depósito que no despacha',
  `update comercial.pedidos set deposito_origen_id=(select id from gmp.depositos where numero='04') where id='${vC5}'`,
  /fábrica, de Berna o de Calle 5/,
);
for (const v of [vBella, vOtro, vC5])
  await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [v]);

await como('naza@x');
const disp = async (d, p) =>
  N(
    (
      await uno(
        `select disponible from comercial.v_disponible_pt where deposito_id=$1 and producto_id=$2`,
        [d, p],
      )
    )?.disponible,
  );
await prueba(
  'Naza reserva lo que hay de Bella en fábrica: queda esperando fecha por lo otro',
  async () => {
    const r = await uno(`select comercial.reservar_producto_venta($1,$2) r`, [
      vBella,
      p101,
    ]);
    if (N(r.r.reservado) !== 20 || r.r.aprobado !== false)
      throw new Error(JSON.stringify(r));
    if ((await estado(vBella)) !== 'ESPERANDO_FECHA')
      throw new Error(await estado(vBella));
    if ((await disp(PTF, p101)) !== 10) throw new Error(`libre ${await disp(PTF, p101)}`);
  },
);
await rechaza(
  'lo que no hay no se reserva',
  `select comercial.reservar_producto_venta('${vBella}','${p102}')`,
  /No hay stock libre/,
);
await prueba(
  'de la venta de Berna reserva todo: queda aprobada con fecha de hoy',
  async () => {
    const r = await uno(`select comercial.reservar_producto_venta($1,$2) r`, [
      vOtro,
      p101,
    ]);
    if (r.r.aprobado !== true) throw new Error(JSON.stringify(r));
    const p = await uno(
      `select estado, fecha_entrega = (now() at time zone 'America/Argentina/Buenos_Aires')::date hoy from comercial.pedidos where id=$1`,
      [vOtro],
    );
    if (p.estado !== 'CONFIRMADO' || !p.hoy) throw new Error(JSON.stringify(p));
    if ((await disp(BER, p101)) !== 2) throw new Error(`libre ${await disp(BER, p101)}`);
  },
);
await prueba('Naza propone fecha solo por lo que hay que producir', async () => {
  await q(`select comercial.proponer_fecha($1, current_date + 10)`, [vBella]);
});

await como('mati@x');
await prueba(
  'Mati aprueba: lo reservado cuenta, lo que falta va a producción en fábrica',
  async () => {
    const r = await uno(`select comercial.enviar_venta($1) r`, [vBella]);
    if (N(r.r.a_producir) !== 5) throw new Error(JSON.stringify(r));
    const rr = await q(
      `select producto_id, de_calle5, a_producir from comercial.pedido_renglones where pedido_id=$1 order by cantidad desc`,
      [vBella],
    );
    if (N(rr[0].de_calle5) !== 20 || N(rr[1].a_producir) !== 5)
      throw new Error(JSON.stringify(rr));
    const res = await uno(
      `select coalesce(sum(cantidad - consumido),0) s from comercial.reservas_pt where pedido_id=$1 and not liberada`,
      [vBella],
    );
    if (N(res.s) !== 20) throw new Error(`reservado ${res.s} (no tiene que duplicar)`);
    const s = await uno(
      `select d.numero from comercial.pedidos s join gmp.depositos d on d.id = s.destino_deposito_id where s.para_pedido_id=$1`,
      [vBella],
    );
    if (s.numero !== 'PTF') throw new Error(s.numero);
  },
);
await prueba('la de Berna se despacha desde Berna', async () => {
  await q(`select comercial.despachar_pedido($1, $2::jsonb, 'BER')`, [
    vOtro,
    JSON.stringify([{ producto_id: p101, cantidad: 8 }]),
  ]);
  if ((await estado(vOtro)) !== 'CUMPLIDO') throw new Error(await estado(vOtro));
});

await como('naza@x');
await prueba('Naza descarta el de Calle 5 con reserva: se cancela y libera', async () => {
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',3,'stock C5',(select id from core.usuarios where email='naza@x'))`,
    [p101, C5],
  );
  await db.exec('set session_replication_role = origin');
  await como('naza@x');
  await uno(`select comercial.reservar_producto_venta($1,$2) r`, [vC5, p101]);
  if ((await estado(vC5)) !== 'CONFIRMADO') throw new Error(await estado(vC5));
  await q(`select comercial.eliminar_pedido($1, 'Descartado')`, [vC5]);
  const r = await uno(
    `select count(*)::int n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
    [vC5],
  );
  if ((await estado(vC5)) !== 'CANCELADO' || r.n !== 0)
    throw new Error(`${await estado(vC5)} ${r.n}`);
});
await prueba('RN-51: lo de un lote retenido no cuenta como disponible', async () => {
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  // Un lote sin liberar (la orden no existe: gmp.impedimento_despacho_orden lo retiene).
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, orden_id, registrado_por)
     values ($1,$2,'ENTRADA_DEVOLUCION',30,'lote retenido',gen_random_uuid(),(select id from core.usuarios where email='naza@x'))`,
    [p102, PTF],
  );
  await db.exec('set session_replication_role = origin');
  await como('naza@x');
  if ((await disp(PTF, p102)) !== 0) throw new Error(`libre ${await disp(PTF, p102)}`);
});

await como('mati@x');
const vR = await venta('V-R', 'Kiosco Pepe', [
  [p101, 2],
  [p102, 1],
]);
await q(`update comercial.pedidos set estado='ESPERANDO_FECHA' where id=$1`, [vR]);
await como('naza@x');
await q(`select comercial.reservar_producto_venta($1,$2)`, [vR, p101]);
await como('mati@x');
await prueba(
  'si Mati baja la cantidad, se libera lo reservado de ese producto',
  async () => {
    await q(
      `update comercial.pedido_renglones set cantidad = 1 where pedido_id=$1 and producto_id=$2`,
      [vR, p101],
    );
    const r = await uno(
      `select count(*)::int n from comercial.reservas_pt where pedido_id=$1 and not liberada`,
      [vR],
    );
    if (r.n !== 0) throw new Error(`${r.n} vigentes`);
  },
);
await invariantes();
fin();
