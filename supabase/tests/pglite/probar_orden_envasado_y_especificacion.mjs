// Orden de envasado de granel (fórmula en borrador con el granel como único
// componente, la carga Naza) y especificación que completa DT después
// (20261027150000, D-orden-producto-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como('naza@x');
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const granel = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
     values ('GR-1', 'Granel comprado', 'SEMIELABORADO', 'kg', false) returning id`,
  )
).id;
let formula, orden;
await prueba('Naza arma la fórmula de envasado: el granel al 100 %, en borrador', async () => {
  formula = (
    await uno(
      `insert into gmp.formulas_fabricacion (producto_id, version, estado) values ($1, 'Envasado', 'BORRADOR') returning id`,
      [prod],
    )
  ).id;
  await q(
    `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp, etapa) values ($1, 1, $2, 100, 'Envasado del granel')`,
    [formula, granel],
  );
});
await prueba('y abre la orden sin especificación, con vencimiento MM/AA a dos años', async () => {
  orden = await uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, cantidad_teorica, vencimiento)
     values ($1, $2, '2026-10-27', 20, '2028-10-31') returning id, especificacion_id, vencimiento_texto`,
    [formula, prod],
  );
  if (orden.especificacion_id !== null || orden.vencimiento_texto !== 'P1 10/28')
    throw new Error(JSON.stringify(orden));
});
await rechaza(
  'Naza no asigna la especificación',
  `select gmp.asignar_especificacion_orden('${orden.id}', gen_random_uuid())`,
  /Dirección Técnica/,
);

await como(DT);
const esp = (
  await uno(
    `insert into gmp.especificaciones (codigo_poe, version, denominacion, vida_util_meses) values ('I-E.ENV','00','ENVASADO',24) returning id`,
  )
).id;
await rechaza(
  'directo sigue sin poder cambiarse',
  `update gmp.ordenes_produccion set especificacion_id = '${esp}' where id = '${orden.id}'`,
  /no cambian/,
);
await prueba('DT la completa desde su tablero', async () => {
  await q(`select gmp.asignar_especificacion_orden($1, $2)`, [orden.id, esp]);
  const o = await uno(`select especificacion_id from gmp.ordenes_produccion where id = $1`, [orden.id]);
  if (o.especificacion_id !== esp) throw new Error('no quedó');
});
await rechaza(
  'y una vez puesta no se cambia',
  `select gmp.asignar_especificacion_orden('${orden.id}', '${esp}')`,
  /ya tiene especificación/,
);
await invariantes();
fin();
