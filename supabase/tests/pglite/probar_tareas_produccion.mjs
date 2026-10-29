// Tareas de producción: grupos, tiempos y productividad
// (20261023130000-130100, D-tareas-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('delia@x', 'PRODUCCION');
await usuario('agus@x', 'PRODUCCION');
await usuario('emi@x', 'PRODUCCION');
await usuario('gabriel@x', 'FINANZAS');
await usuario('ventas@x', 'VENTAS');
await db.exec('reset role');
const id = async (email) =>
  (await uno(`select id from core.usuarios where email = $1`, [email])).id;
const [delia, agus, emi] = [await id('delia@x'), await id('agus@x'), await id('emi@x')];
// Mueve los tiempos de un tramo como si hubiera pasado el tiempo.
const atrasar = async (tramo, minutos) => {
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  await q(
    `update gmp.tarea_tramos set iniciado_en = iniciado_en - make_interval(mins => $2) where id = $1`,
    [tramo, minutos],
  );
  await q(
    `update gmp.tramo_participantes set desde = desde - make_interval(mins => $2) where tramo_id = $1`,
    [tramo, minutos],
  );
  await db.exec('set session_replication_role = origin');
};

await como('naza@x');
const prod = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
let tarea;
await prueba('Naza arma el día y manda «Envasar 500» a Delia y Agustina', async () => {
  await q(
    `insert into gmp.jornadas_operarias (fecha, usuario_id) values (current_date, $1), (current_date, $2)`,
    [delia, agus],
  );
  const j = await uno(
    `select entrada::text e, salida::text s from gmp.jornadas_operarias where usuario_id = $1`,
    [delia],
  );
  if (j.e !== '08:00:00' || j.s !== '15:00:00') throw new Error(JSON.stringify(j));
  tarea = (
    await uno(
      `insert into gmp.tareas_produccion (tipo, descripcion, producto_id, cantidad, asignadas) values ('ENVASAR', 'Envasar 500 unidades de Sanitizante', $1, 500, $2) returning id`,
      [prod, [delia, agus]],
    )
  ).id;
});

await como('emi@x');
await prueba('Emi no la ve: no es suya', async () => {
  if ((await q(`select 1 from gmp.tareas_produccion where id = $1`, [tarea])).length)
    throw new Error('la ve');
});
await como('delia@x');
let tramo;
await prueba('Delia la ve y la inicia con Agustina', async () => {
  tramo = (await uno(`select gmp.iniciar_tarea($1, $2) id`, [tarea, [agus]])).id;
  const t = await uno(`select estado from gmp.tareas_produccion where id = $1`, [tarea]);
  if (t.estado !== 'EN_CURSO') throw new Error(t.estado);
});
await rechaza(
  'los tiempos no se escriben a mano',
  `update gmp.tarea_tramos set iniciado_en = now() - interval '1 day' where id = '${tramo}'`,
  /registra la base/,
);
await rechaza(
  'ni se inicia dos veces',
  `select gmp.iniciar_tarea('${tarea}')`,
  /ya está empezada/,
);
await prueba('Delia no ve la productividad: la vista le devuelve vacío', async () => {
  if ((await q(`select 1 from gmp.v_trabajo_operarias`)).length)
    throw new Error('ve productividad');
});
await atrasar(tramo, 60);
await prueba('Delia pone «listo por hoy»: 300 y queda pendiente', async () => {
  await q(`select gmp.cerrar_tramo($1, 'LISTO_HOY', 300)`, [tramo]);
  const t = await uno(`select estado from gmp.tareas_produccion where id = $1`, [tarea]);
  if (t.estado !== 'PENDIENTE') throw new Error(t.estado);
});

await como('naza@x');
await prueba('150 para cada una, una hora cada una, con quién', async () => {
  const r = await q(
    `select operaria, cantidad::float c, round(minutos)::int m, con_quien from gmp.v_trabajo_operarias where tarea_id = $1 order by operaria`,
    [tarea],
  );
  if (r.length !== 2 || r.some((x) => x.c !== 150 || x.m !== 60))
    throw new Error(JSON.stringify(r));
  if (r[0].con_quien !== 'delia@x' || r[1].con_quien !== 'agus@x')
    throw new Error(JSON.stringify(r));
});

// Segundo día: empieza Agustina sola, Emi se suma a la mitad.
await como('agus@x');
let tramo2;
await prueba('al otro día sigue Agustina; Emi se suma', async () => {
  tramo2 = (await uno(`select gmp.iniciar_tarea($1) id`, [tarea])).id;
  await atrasar(tramo2, 60);
  await como('agus@x');
  await q(`select gmp.cambiar_grupo($1, $2, true)`, [tramo2, emi]);
  await db.exec('reset role');
  await db.exec('set session_replication_role = replica');
  await q(
    `update gmp.tramo_participantes set desde = desde - interval '30 minutes' where tramo_id = $1 and usuario_id = $2`,
    [tramo2, emi],
  );
  await db.exec('set session_replication_role = origin');
});
await como('emi@x');
await prueba(
  'Emi ahora la ve y completa: lo que faltaba (200), repartido por tiempo',
  async () => {
    if (!(await q(`select 1 from gmp.tareas_produccion where id = $1`, [tarea])).length)
      throw new Error('no la ve');
    await q(`select gmp.cerrar_tramo($1, 'COMPLETA')`, [tramo2]);
    await como('naza@x');
    const r = await q(
      `select operaria, cantidad::float c from gmp.v_trabajo_operarias where tramo_id = $1 order by operaria`,
      [tramo2],
    );
    // Agustina 60 min, Emi 30 min: 200 × 60/90 y 200 × 30/90.
    const [a, e] = r;
    if (Math.abs(a.c - 133.333) > 0.01 || Math.abs(e.c - 66.667) > 0.01)
      throw new Error(JSON.stringify(r));
    const t = await uno(`select estado from gmp.tareas_produccion where id = $1`, [
      tarea,
    ]);
    if (t.estado !== 'LISTA') throw new Error(t.estado);
  },
);
await prueba('el tiempo medido por unidad sale de ahí', async () => {
  const m = await uno(
    `select unidades::float u, minutos_por_unidad::float m from gmp.v_tiempo_medido_producto where producto_id = $1 and tipo = 'ENVASAR'`,
    [prod],
  );
  // 120 + 90 minutos-persona para 500 unidades.
  if (m.u !== 500 || Math.abs(m.m - 0.42) > 0.001) throw new Error(JSON.stringify(m));
});
await rechaza(
  'una lista no se modifica',
  `update gmp.tareas_produccion set descripcion = 'x' where id = '${tarea}'`,
  /ya no se modifica/,
);

// D-tareas-2: Delia y Agustina trabajan 60 min, pausan, siguen 30 min y cargan 90 en el «Listo»: 45 y 45.
await como('naza@x');
const t3 = (
  await uno(
    `insert into gmp.tareas_produccion (tipo, descripcion, producto_id, cantidad, asignadas) values ('ETIQUETAR', 'Etiquetar 200', $1, 200, $2) returning id`,
    [prod, [delia, agus]],
  )
).id;
await como('delia@x');
let antes;
await prueba('la pausa no pide cantidad y la tarea sigue en curso', async () => {
  antes = (await uno(`select gmp.iniciar_tarea($1, $2) id`, [t3, [agus]])).id;
  await atrasar(antes, 60);
  await como('delia@x');
  await q(`select gmp.cerrar_tramo($1, 'PAUSA')`, [antes]);
  const t = await uno(`select estado from gmp.tareas_produccion where id = $1`, [t3]);
  if (t.estado !== 'EN_CURSO') throw new Error(t.estado);
});
let despues;
await como('agus@x');
await prueba('siguen con el mismo grupo', async () => {
  despues = (await uno(`select gmp.reanudar_tarea($1) id`, [t3])).id;
  const g = await q(
    `select usuario_id from gmp.tramo_participantes where tramo_id = $1 and hasta is null`,
    [despues],
  );
  if (g.length !== 2) throw new Error(JSON.stringify(g));
});
await rechaza(
  'no se reanuda dos veces',
  `select gmp.reanudar_tarea('${t3}')`,
  /no está en pausa/,
);
await atrasar(despues, 30);
await como('agus@x');
await prueba('lo del «Listo» cubre antes y después de la pausa', async () => {
  await q(`select gmp.cerrar_tramo($1, 'LISTO_HOY', 90)`, [despues]);
  await como('naza@x');
  const r = await q(
    `select operaria, sum(cantidad)::float c from gmp.v_trabajo_operarias where tarea_id = $1 group by operaria order by operaria`,
    [t3],
  );
  if (r.length !== 2 || r.some((x) => Math.abs(x.c - 45) > 0.01))
    throw new Error(JSON.stringify(r));
  const antesDe = await q(
    `select cantidad::float c from gmp.v_trabajo_operarias where tramo_id = $1`,
    [antes],
  );
  // 60 de los 90 minutos de cada una fueron antes de la pausa.
  if (antesDe.some((x) => Math.abs(x.c - 30) > 0.01))
    throw new Error(JSON.stringify(antesDe));
});

await como('gabriel@x');
await prueba('Gabriel (Finanzas) ve la productividad', async () => {
  if ((await q(`select 1 from gmp.v_trabajo_operarias`)).length < 4)
    throw new Error('no ve');
});
await como('ventas@x');
await rechaza(
  'Ventas no manda tareas',
  `insert into gmp.tareas_produccion (tipo, descripcion) values ('OTRA', 'Limpiar')`,
  /row-level security|violates/,
);
await como('naza@x');
await prueba('Naza cancela una pendiente', async () => {
  const t = (
    await uno(
      `insert into gmp.tareas_produccion (tipo, descripcion) values ('OTRA', 'Limpiar') returning id`,
    )
  ).id;
  await q(`update gmp.tareas_produccion set estado = 'CANCELADA' where id = $1`, [t]);
});
await q(
  `insert into gmp.tareas_produccion (tipo, descripcion) values ('OTRA', 'Ordenar')`,
);
await rechaza(
  'pero no la marca lista a mano',
  `update gmp.tareas_produccion set estado = 'LISTA' where descripcion = 'Ordenar'`,
  /a mano solo se cancela|ya no se modifica/,
);
await prueba('el informe anual sale de las órdenes terminadas, por viernes', async () => {
  const r = await q(
    `select extract(isodow from viernes)::int d from gmp.v_produccion_semanal limit 1`,
  );
  if (r.length && r[0].d !== 5) throw new Error(JSON.stringify(r));
});

await invariantes();
fin();
