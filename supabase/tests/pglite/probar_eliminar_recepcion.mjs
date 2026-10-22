// Eliminar una recepción sin motivo (20261022160200, D-recepcion-3).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('silveira@x', 'RECEPCION');
await usuario('ventas@x', 'VENTAS');
await usuario('sys@x', 'ADMINISTRADOR_SISTEMA');

await como('silveira@x');
await db.exec('reset role');
const prov = (await uno(`insert into gmp.proveedores (razon_social) values ('Prov E') returning id`)).id;
await como('silveira@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-E1', 'Frasco E', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const recepcion = async (remito) => {
  const r = (
    await uno(
      `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, $2, true) returning id`,
      [prov, remito],
    )
  ).id;
  const l = (
    await uno(
      `insert into gmp.lotes_insumo (recepcion_id, insumo_id, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
       values ($1, $2, 1, 100, 'UNIDAD', true) returning id`,
      [r, ins],
    )
  ).id;
  return { r, l };
};
const mal = await recepcion('R-MAL');
const cargada = await recepcion('R-OK');

await prueba('Silveira elimina la recepción mal cargada, sin motivo', async () => {
  await q(`select gmp.eliminar_recepcion($1)`, [mal.r]);
});
await prueba('ya no la ve, ni a su lote', async () => {
  const r = await q(`select id from gmp.recepciones where id = $1`, [mal.r]);
  const l = await q(`select id from gmp.v_lotes_insumo where id = $1`, [mal.l]);
  if (r.length || l.length) throw new Error('se sigue viendo');
});
await prueba('pero la otra sí', async () => {
  const r = await q(`select id from gmp.recepciones where id = $1`, [cargada.r]);
  if (r.length !== 1) throw new Error('desapareció');
});
await rechaza(
  'no se elimina dos veces',
  `select gmp.eliminar_recepcion('${mal.r}')`,
  /ya se eliminó/,
);
await prueba('una recepción cargada a stock', async () => {
  await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [cargada.r]);
});
await rechaza(
  'ya no se elimina',
  `select gmp.eliminar_recepcion('${cargada.r}')`,
  /ya se cargó a stock/,
);
await rechaza(
  'ni por escritura directa',
  `insert into gmp.recepciones_eliminadas (recepcion_id) values ('${cargada.r}')`,
  /ya se cargó a stock/,
);
await como('ventas@x');
await rechaza(
  'Ventas no elimina recepciones',
  `select gmp.eliminar_recepcion('${cargada.r}')`,
  /quien las registra/,
);
await como('sys@x');
await prueba('el administrador del sistema la sigue viendo, con quién y cuándo', async () => {
  const r = await uno(
    `select e.eliminada_en, u.email from gmp.recepciones r
       join gmp.recepciones_eliminadas e on e.recepcion_id = r.id
       join core.usuarios u on u.id = e.eliminada_por
      where r.id = $1`,
    [mal.r],
  );
  if (!r?.eliminada_en || r.email !== 'silveira@x') throw new Error(JSON.stringify(r));
});
await db.exec('reset role');
await rechaza(
  'y no se deshace, ni siquiera sin RLS',
  `delete from gmp.recepciones_eliminadas where recepcion_id = '${mal.r}'`,
  /./,
);
await invariantes();
fin();
