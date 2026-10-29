// Productos hermanos (20261028130000, D-hermanos-1): del mismo granel salen
// el sanitizante de 1 L y el de 250 ml, con el mismo lote; al terminar se
// carga cuántos de cada uno, y lo que ya entró se puede repartir de nuevo.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes, liberarAtajo } =
  await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('op@x', 'OPERARIO');
await usuario('ventas@x', 'VENTAS');
const DT = 'salta.agustin@gmail.com';
const N = (x) => Number(x ?? 0);
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como('naza@x');
const prod = async (codigo, nombre) =>
  (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ($1, $2, 24) returning id`,
      [codigo, nombre],
    )
  ).id;
const litro = await prod('SAN1L', 'Sanitizante 1 L');
const chico = await prod('SAN250', 'Sanitizante 250 ml');
const otro = await prod('CREMA', 'Crema');
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;

await prueba('Naza los hace hermanos', async () => {
  await q(`select gmp.vincular_hermano($1, $2)`, [litro, chico]);
  const r = await uno(`select gmp.son_hermanos($1, $2) h, gmp.son_hermanos($1, $3) o`, [
    chico,
    litro,
    otro,
  ]);
  if (!r.h || r.o) throw new Error(JSON.stringify(r));
});
await como('ventas@x');
await rechaza(
  'Ventas no',
  `select gmp.vincular_hermano('${litro}', '${otro}')`,
  /Gerencia de Producción/,
);

await como(DT);
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [litro],
  )
).id;
const orden = async (partida) => {
  await como('naza@x');
  const o = (
    await uno(
      `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica) values ($1,$2,current_date,$3,10) returning id`,
      [f, litro, partida],
    )
  ).id;
  await como('op@x');
  await q(
    `insert into gmp.op_etapas (orden_id, etapa, datos) values ($1,'FRACCIONAMIENTO','{}')`,
    [o],
  );
  await como('naza@x');
  return o;
};
const enPtf = async (o, p) =>
  N(
    (
      await uno(
        `select coalesce(sum(cantidad),0) s from comercial.movimientos_pt where orden_id=$1 and producto_id=$2 and deposito_id=$3`,
        [o, p, PTF],
      )
    ).s,
  );

const o1 = await orden(1);
await rechaza(
  'el reparto tiene que sumar lo obtenido',
  `select comercial.terminar_orden('${o1}', 10, 20, '[{"producto_id":"${litro}","unidades":5},{"producto_id":"${chico}","unidades":10}]')`,
  /suma 15/,
);
await rechaza(
  'y solo entre hermanos',
  `select comercial.terminar_orden('${o1}', 10, 20, '[{"producto_id":"${litro}","unidades":10},{"producto_id":"${otro}","unidades":10}]')`,
  /no es hermano/,
);
await prueba('termina con 8 de litro y 30 de 250 ml, con el mismo lote', async () => {
  await q(`select comercial.terminar_orden($1, 10, 38, $2)`, [
    o1,
    JSON.stringify([
      { producto_id: litro, unidades: 8 },
      { producto_id: chico, unidades: 30 },
    ]),
  ]);
  if ((await enPtf(o1, litro)) !== 8 || (await enPtf(o1, chico)) !== 30)
    throw new Error('reparto');
});
await prueba('los dos quedan retenidos hasta que la DT libera el lote', async () => {
  const r = await uno(
    `select retenido from comercial.v_stock_pt where deposito_id=$1 and producto_id=$2`,
    [PTF, chico],
  );
  if (N(r.retenido) !== 30) throw new Error(JSON.stringify(r));
});

const o2 = await orden(2);
await prueba('sin reparto, como antes: todo del producto de la orden', async () => {
  await q(`select comercial.terminar_orden($1, 10, 771)`, [o2]);
  if ((await enPtf(o2, litro)) !== 771) throw new Error('sin reparto');
});
await rechaza(
  'y un motivo',
  `select comercial.repartir_stock_hermanos('PTF', '${o2}', '[{"producto_id":"${chico}","unidades":771}]', '')`,
  /por qué/,
);
await prueba(
  '«salieron 300 de 250 ml y el resto de litro»: dos ajustes con el lote',
  async () => {
    await q(
      `select comercial.repartir_stock_hermanos('PTF', $1, $2, 'Conteo en planta')`,
      [
        o2,
        JSON.stringify([
          { producto_id: chico, unidades: 300 },
          { producto_id: litro, unidades: 471 },
        ]),
      ],
    );
    if ((await enPtf(o2, litro)) !== 471 || (await enPtf(o2, chico)) !== 300)
      throw new Error('reparto');
    const m = await q(
      `select tipo, cantidad, motivo from comercial.movimientos_pt where orden_id=$1 and tipo::text like '%AJUSTE' order by cantidad`,
      [o2],
    );
    if (m.length !== 2 || !m[0].motivo.includes('Conteo en planta'))
      throw new Error(JSON.stringify(m));
  },
);
await como(DT);
await rechaza(
  'la DT no reparte (es de Gerencia de Producción)',
  `select comercial.repartir_stock_hermanos('PTF', '${o2}', '[{"producto_id":"${litro}","unidades":771}]', 'x y z')`,
  /Gerencia de Producción/,
);

// 20261028170000: en cualquier depósito y también lo que no tiene lote.
await como('naza@x');
const enBer = async (p) =>
  Number(
    (
      await uno(
        `select coalesce(sum(m.cantidad),0) s from comercial.movimientos_pt m join gmp.depositos d on d.id=m.deposito_id
          where d.numero='BER' and m.producto_id=$1 and m.orden_id is null`,
        [p],
      )
    ).s,
  );
await q(
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo)
   select $1, id, 'ENTRADA_AJUSTE', 771, 'carga inicial' from gmp.depositos where numero='BER'`,
  [litro],
);
await prueba(
  'sin lote en Berna: 300 de 250 ml y 471 de litro, sin tocar el lote',
  async () => {
    await q(
      `select comercial.repartir_stock_hermanos('BER', null, $1, 'Conteo en Berna')`,
      [
        JSON.stringify([
          { producto_id: litro, unidades: 471 },
          { producto_id: chico, unidades: 300 },
        ]),
      ],
    );
    if ((await enBer(litro)) !== 471 || (await enBer(chico)) !== 300)
      throw new Error('reparto');
    if ((await enPtf(o2, litro)) !== 471) throw new Error('tocó el lote');
  },
);
await como(DT);

await liberarAtajo(o1);
await como('naza@x');
await prueba('liberado el lote, el hermano también sale de la fábrica', async () => {
  await q(`select comercial.transferir_pt($1, 10, 'PTF', 'C5')`, [chico]);
});

// Pedido de un hermano (250 ml) con la orden del otro (1 L): «Terminado» del
// pedido encuentra el lote y no carga de nuevo lo que ya entró por la orden.
await como('naza@x');
const o3 = await orden(3);
const envase = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
     values ('ENV-250', 'Frasco 250', 'MATERIAL_ENVASE', 'UNIDAD', false) returning id`,
  )
).id;
await q(
  `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol) values ($1,$2,1,'ENVASE')`,
  [chico, envase],
);
const ped = (
  await uno(
    `insert into comercial.pedidos (numero, cliente) values ('P-H', 'Ana') returning id`,
  )
).id;
await q(
  `insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,10,1)`,
  [ped, chico],
);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);
await q(`insert into comercial.pedido_ordenes (pedido_id, orden_id) values ($1,$2)`, [
  ped,
  o3,
]);
await prueba('la orden carga el hermano a nombre de su pedido', async () => {
  await q(`select comercial.terminar_orden($1, 10, 15, $2)`, [
    o3,
    JSON.stringify([
      { producto_id: litro, unidades: 5 },
      { producto_id: chico, unidades: 10 },
    ]),
  ]);
  const m = await uno(
    `select documento_tipo, documento_id from comercial.movimientos_pt where orden_id=$1 and producto_id=$2`,
    [o3, chico],
  );
  if (m.documento_tipo !== 'PEDIDO' || m.documento_id !== ped)
    throw new Error(JSON.stringify(m));
});
await rechaza(
  'volver a terminar con otro reparto avisa en vez de callarse',
  `select comercial.terminar_orden('${o3}', 10, 15, '[{"producto_id":"${chico}","unidades":15}]')`,
  /Corregir reparto/,
);
await prueba(
  '«Terminado» del pedido del hermano no duplica ni deja unidades sin lote',
  async () => {
    const cons = (
      await q(`select insumo_id from comercial.necesidad_pedido($1)`, [ped])
    ).map((x) => ({
      insumo_id: x.insumo_id,
      cantidad: 0,
      motivo: 'prueba sin material',
    }));
    await q(`select comercial.terminar_pedido($1, $2::jsonb)`, [
      ped,
      JSON.stringify(cons),
    ]);
    const r = await uno(
      `select coalesce(sum(cantidad),0) total, count(*) filter (where orden_id is null) sin_lote
       from comercial.movimientos_pt where producto_id=$1 and tipo='ENTRADA_PRODUCCION' and documento_id=$2`,
      [chico, ped],
    );
    if (N(r.total) !== 10 || N(r.sin_lote) !== 0) throw new Error(JSON.stringify(r));
  },
);

// 20261029120000: el total puede cambiar y la diferencia queda en el lote.
await como('naza@x');
await prueba('salieron 9 de más: entran al mismo lote, no como sin lote', async () => {
  const sinLote = async () =>
    N(
      (
        await uno(
          `select coalesce(sum(cantidad),0) s from comercial.movimientos_pt where orden_id is null and deposito_id=$1 and producto_id = any($2)`,
          [PTF, [litro, chico]],
        )
      ).s,
    );
  const antes = await sinLote();
  await q(`select comercial.repartir_stock_hermanos('PTF', $1, $2, 'conteo')`, [
    o2,
    JSON.stringify([
      { producto_id: litro, unidades: 480 },
      { producto_id: chico, unidades: 300 },
    ]),
  ]);
  if ((await enPtf(o2, litro)) !== 480 || (await enPtf(o2, chico)) !== 300)
    throw new Error('no quedó en el lote');
  if ((await sinLote()) !== antes) throw new Error('quedó sin lote');
  const m = await uno(
    `select count(*) n from comercial.movimientos_pt where orden_id=$1 and tipo='ENTRADA_AJUSTE' and motivo like '%(había 771, quedan 780): conteo'`,
    [o2],
  );
  if (N(m.n) !== 1) throw new Error('sin motivo con la diferencia');
});

await prueba('desvincular deja a los dos sin hermanos', async () => {
  await q(`select gmp.desvincular_hermano($1)`, [chico]);
  const r = await q(`select familia_granel from gmp.productos where id = any($1)`, [
    [litro, chico],
  ]);
  if (r.some((x) => x.familia_granel !== null)) throw new Error(JSON.stringify(r));
});
await invariantes();
fin();
