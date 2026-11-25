// Orden con más de 5 kg o L por unidad (20261125120000): caso OP-2026-0029,
// 336 unidades de 240 g abiertas como 80.640 kg.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);

await como('naza@x');
const p = (
  await uno(
    `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ('HUM240','HUM240',24) returning id`,
  )
).id;
const mp = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
     values ('CREMA','CREMA','MATERIA_PRIMA','g',false) returning id`,
  )
).id;
await como(DT);
const f = (
  await uno(
    `insert into gmp.formulas_fabricacion (producto_id, version) values ($1,'00') returning id`,
    [p],
  )
).id;
await q(
  `insert into gmp.formula_componentes (formula_id, orden, insumo_id, porcentaje_pp) values ($1,1,$2,100)`,
  [f, mp],
);
await como('naza@x');
const abrir = (cant, unidades, partida) =>
  `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica, unidades_previstas)
   values ('${f}','${p}',current_date,${partida},${cant},${unidades}) returning id`;

await rechaza('80.640 kg para 336 unidades', abrir(80640, 336, 1), /por unidad/);
await prueba('80,64 kg para 336 unidades', async () => {
  await uno(abrir(80.64, 336, 2));
});
await prueba('sin unidades previstas no se controla', async () => {
  await uno(abrir(500, 'null', 3));
});

// Rectificación de la teórica (20261125120100).
await como('naza@x');
const o = (await uno(abrir(10, 100, 4))).id;
const pide = async () =>
  Number(
    (
      await uno(
        `select necesita from comercial.faltantes_tanda($1, $2::jsonb) where codigo = 'CREMA'`,
        [o, JSON.stringify([{ producto_id: p, unidades: 1 }])],
      )
    ).necesita,
  );
await prueba('faltantes con la original: 10 kg = 10000 g', async () => {
  if ((await pide()) !== 10000) throw new Error(String(await pide()));
});
await rechaza(
  'Gerencia de Producción no rectifica',
  `select gmp.rectificar_teorica_orden('${o}', 5, 'x')`,
  /Dirección Técnica/,
);
await como(DT);
await rechaza(
  'la rectificación también controla por unidad',
  `select gmp.rectificar_teorica_orden('${o}', 1000, 'x')`,
  /por unidad/,
);
await rechaza(
  'sin motivo no',
  `select gmp.rectificar_teorica_orden('${o}', 5, ' ')`,
  /motivo/,
);
await prueba('DT rectifica a 5 kg', async () => {
  await q(`select gmp.rectificar_teorica_orden($1, 5, 'gramos como kilos')`, [o]);
});
await prueba('faltantes con la vigente: 5000 g', async () => {
  if ((await pide()) !== 5000) throw new Error(String(await pide()));
});
await rechaza(
  'la rectificación no se modifica',
  `update gmp.ordenes_teorica_rectificaciones set cantidad = 7`,
  /no se modifica|permission|0 filas|row-level/i,
);

await invariantes();
fin();
