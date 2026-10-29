// Precio de Gerencia de Producción (20261021140000). Desde 20261029140000
// (D-costo-naza-1) es el que manda: le gana a Finanzas y a las compras.
import { banco } from './lib.mjs';
const { uno, q, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('fin@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('ventas@x', 'VENTAS');

await como('naza@x');
const alcohol = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
     values ('MP-ALC', 'Alcohol', 'MATERIA_PRIMA', 'ml', false) returning id`,
  )
).id;
const ref = () =>
  uno(`select * from comercial.v_costo_referencia where insumo_id = $1`, [alcohol]);

await prueba('sin nada cargado no hay costo', async () => {
  const r = await ref();
  if (r.costo_unitario_ars !== null) throw new Error(JSON.stringify(r));
});
await prueba(
  'el tacho de 20 l a $ 85.000 da $ 4,25 el ml, y no es provisorio',
  async () => {
    await q(
      `insert into comercial.costos_estimados (insumo_id, importe, cantidad, unidad) values ($1, 85000, 20, 'l')`,
      [alcohol],
    );
    const r = await ref();
    if (
      Number(r.costo_unitario_ars) !== 4.25 ||
      r.origen !== 'ESTIMADO' ||
      r.desactualizado
    )
      throw new Error(JSON.stringify(r));
  },
);
await prueba('el último estimado reemplaza al anterior', async () => {
  await q(
    `insert into comercial.costos_estimados (insumo_id, importe, cantidad, unidad) values ($1, 100000, 20, 'l')`,
    [alcohol],
  );
  if (Number((await ref()).costo_unitario_ars) !== 5)
    throw new Error('no tomó el último');
});
await como('ventas@x');
await rechaza(
  'Ventas no estima costos',
  `insert into comercial.costos_estimados (insumo_id, importe, cantidad, unidad) values ('${alcohol}', 1, 1, 'l')`,
  /row-level security|policy/i,
);
await como('fin@x');
await prueba('el precio de Naza le gana al de Finanzas', async () => {
  await q(
    `insert into comercial.costos_referencia (insumo_id, importe, incluye_iva, cantidad, unidad) values ($1, 60000, false, 20, 'l')`,
    [alcohol],
  );
  const r = await ref();
  if (
    Number(r.costo_unitario_ars) !== 5 ||
    r.origen !== 'ESTIMADO' ||
    Number(r.costo_manual) !== 3
  )
    throw new Error(JSON.stringify(r));
});
await como('naza@x');
await prueba('Naza lo vuelve a cambiar y vale el último', async () => {
  await q(
    `insert into comercial.costos_estimados (insumo_id, importe, cantidad, unidad) values ($1, 120000, 20, 'l')`,
    [alcohol],
  );
  if (Number((await ref()).costo_unitario_ars) !== 6)
    throw new Error('no tomó el último');
});
await rechaza(
  'un estimado no se edita',
  `update comercial.costos_estimados set importe = 1 where insumo_id = '${alcohol}' returning id`,
  /permission|denied|policy/i,
);
await invariantes();
fin();
