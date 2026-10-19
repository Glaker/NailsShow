// contadores de OP y de análisis sin escritura directa (20261016130000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('cc@x', 'CONTROL_CALIDAD');
const DT = 'salta.agustin@gmail.com';
await db.exec('reset role');
await q(`update core.usuarios set rol='DIRECCION_TECNICA' where email=$1`, [DT]);
await como(DT);
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const f = await uno(
  `insert into gmp.formulas_fabricacion (producto_id, version, codigo_me) values ($1,'00','ME.40.26') returning id, producto_id`,
  [prod],
);
await como('naza@x');
const orden = (n) =>
  uno(
    `insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, presentacion, cantidad_teorica, vencimiento)
  values ($1,$2,'2025-07-11',$3,1,50,'2028-07-01') returning id, numero`,
    [f.id, f.producto_id, n],
  );
await prueba('las órdenes se siguen numerando', async () => {
  const a = await orden(1),
    b = await orden(2);
  if (a.numero !== 'OP-2025-0001' || b.numero !== 'OP-2025-0002')
    throw new Error(JSON.stringify([a, b]));
});
await rechaza(
  'Producción no retrocede el contador de OP',
  `update gmp.contadores_orden set ultimo = 0`,
  /permission denied/,
);
await rechaza(
  'ni inserta uno',
  `insert into gmp.contadores_orden (anio, ultimo) values (2030, 99)`,
  /permission denied/,
);
await rechaza(
  'ni llama al incremento suelto',
  `select gmp.siguiente_numero_orden(2025)`,
  /llamada suelta/,
);
await prueba('la tercera sigue sin hueco', async () => {
  const c = await orden(3);
  if (c.numero !== 'OP-2025-0003') throw new Error(c.numero);
});
const op = (
  await uno(`select id from gmp.ordenes_produccion where numero='OP-2025-0001'`)
).id;
await como('cc@x');
await prueba('los registros de análisis se siguen numerando', async () => {
  await q(`select gmp.dictaminar_granel($1, '100 g', 'Granel', 'Conforme', true)`, [op]);
  const r = await uno(`select numero from gmp.registros_analisis where orden_id=$1`, [
    op,
  ]);
  if (!/^001\//.test(r.numero)) throw new Error(r.numero);
});
await rechaza(
  'Calidad no toca el contador de análisis',
  `update gmp.contadores_analisis set ultimo = 0`,
  /permission denied/,
);
await rechaza(
  'ni llama al incremento suelto',
  `select gmp.siguiente_numero_analisis('R.50.10.1', 2026)`,
  /llamada suelta/,
);
await invariantes();
fin();
