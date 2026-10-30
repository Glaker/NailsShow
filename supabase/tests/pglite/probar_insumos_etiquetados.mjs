// Insumos etiquetados (20261030120000) y carga de la planilla de Romero
// (20261030120100): el conteo deja cada saldo en lo contado, lo etiquetado
// queda vigente por insumo y producto, y corregirlo es otro conteo.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');

const saldo = async (codigo) =>
  Number(
    (
      await uno(
        `select coalesce(sum(s.saldo), 0) as s from comercial.v_saldos_stock s
           join comercial.articulos a on a.id = s.articulo_id
           join gmp.insumos_catalogo i on i.id = a.insumo_id where i.codigo_interno = $1`,
        [codigo],
      )
    ).s,
  );

await prueba('la carga deja cada insumo en lo contado', async () => {
  for (const [c, n] of [
    ['080ENV', 5122],
    ['140ENV', 35],
    ['516BOL', 3032],
    ['391ENV', 47],
    ['111TAP', 4314],
  ]) {
    const s = await saldo(c);
    if (s !== n) throw new Error(`${c}: ${s} en vez de ${n}`);
  }
});
await prueba('44 conteos de la planilla', async () => {
  const r = await uno(
    `select count(*)::int as n from comercial.conteos_inventario where observacion like 'Planilla «stock insumos romero»%'`,
  );
  if (r.n !== 44) throw new Error(String(r.n));
});
await prueba('lo etiquetado vigente: 44 renglones, 541 de 080ENV', async () => {
  const r = await uno(
    `select count(*)::int as n, sum(cantidad) filter (where insumo_codigo = '080ENV')::int as p
       from comercial.v_insumos_etiquetados`,
  );
  if (r.n !== 44 || r.p !== 541) throw new Error(JSON.stringify(r));
});

const par = await uno(
  `select insumo_id, producto_id from comercial.v_insumos_etiquetados
    where insumo_codigo = '080ENV' and producto_codigo = '89'`,
);
const otro = (await uno(`select id from gmp.productos where codigo_interno = '91'`)).id;

await como('naza@x');
await prueba('corregir la cantidad: el vigente es el último', async () => {
  await q(
    `insert into comercial.insumos_etiquetados (insumo_id, producto_id, cantidad) values ($1, $2, 200)`,
    [par.insumo_id, par.producto_id],
  );
  const r = await uno(
    `select cantidad from comercial.v_insumos_etiquetados where insumo_id = $1 and producto_id = $2`,
    [par.insumo_id, par.producto_id],
  );
  if (r.cantidad !== 200) throw new Error(JSON.stringify(r));
});
await prueba('pasarlo a otro producto: el viejo en 0 desaparece', async () => {
  await q(
    `insert into comercial.insumos_etiquetados (insumo_id, producto_id, cantidad) values ($1, $2, 0), ($1, $3, 200)`,
    [par.insumo_id, par.producto_id, otro],
  );
  const r = await q(
    `select producto_codigo, cantidad from comercial.v_insumos_etiquetados where insumo_id = $1 and producto_codigo in ('89', '91')`,
    [par.insumo_id],
  );
  if (r.length !== 1 || r[0].producto_codigo !== '91') throw new Error(JSON.stringify(r));
});
await prueba('el saldo del insumo no cambia por etiquetar', async () => {
  if ((await saldo('080ENV')) !== 5122) throw new Error('cambió');
});
await rechaza(
  'no se edita',
  `update comercial.insumos_etiquetados set cantidad = 1`,
  /permission denied|no se modifica/,
);
await rechaza(
  'no se borra',
  `delete from comercial.insumos_etiquetados`,
  /permission denied|no se modifica/,
);
await rechaza(
  'cantidad negativa',
  `insert into comercial.insumos_etiquetados (insumo_id, producto_id, cantidad) values ('${par.insumo_id}', '${otro}', -1)`,
  /check/,
);

await como('ventas@x');
await prueba('Ventas lo lee', async () => {
  const r = await q(`select 1 from comercial.v_insumos_etiquetados limit 1`);
  if (r.length !== 1) throw new Error('vacío');
});
await rechaza(
  'Ventas no lo carga',
  `insert into comercial.insumos_etiquetados (insumo_id, producto_id, cantidad) values ('${par.insumo_id}', '${otro}', 1)`,
  /row-level security/,
);

await invariantes();
fin();
