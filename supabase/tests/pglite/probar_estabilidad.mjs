// Estabilidad acelerada (D-estabilidad-1, 20261105120000).
import { banco } from './lib.mjs';
const { db, uno, q, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('dt@x', 'DIRECCION_TECNICA');
await usuario('cc@x', 'CONTROL_CALIDAD');
await usuario('gp@x', 'GERENCIA_PRODUCCION');

await como('dt@x');
const est = (
  await uno(
    `insert into gmp.estudios_estabilidad (producto, lote, fecha_inicio)
     values ('Gel base', 'L-1', '2026-11-05') returning id`,
  )
).id;
const par = (
  await uno(
    `insert into gmp.estabilidad_parametros (estudio_id, parametro, especificacion, inicial)
     values ($1, 'pH', '5,5 – 6,5', '6,0') returning id`,
    [est],
  )
).id;

await prueba('la DT carga los resultados a 30, 60 y 90 días', async () => {
  await q(
    `update gmp.estabilidad_parametros set dia_30='6,1', dia_60='6,1', dia_90='6,2' where id=$1`,
    [par],
  );
  const r = await uno(`select dia_90 from gmp.estabilidad_parametros where id=$1`, [par]);
  if (r.dia_90 !== '6,2') throw new Error(r.dia_90);
});
await rechaza(
  'no se cierra sin conclusión',
  `update gmp.estudios_estabilidad set cerrado_en=now() where id='${est}'`,
  /estudios_estabilidad_cierre/,
);

await como('cc@x');
await prueba('Control de Calidad lo ve y no lo edita', async () => {
  const n = await uno(
    `select count(*)::int n from gmp.estabilidad_parametros where estudio_id=$1`,
    [est],
  );
  if (n.n !== 1) throw new Error(`ve ${n.n}`);
  await q(`update gmp.estabilidad_parametros set dia_30='x' where id=$1`, [par]);
  await como('dt@x');
  const r = await uno(`select dia_30 from gmp.estabilidad_parametros where id=$1`, [par]);
  if (r.dia_30 !== '6,1') throw new Error('CC lo cambió');
});
await como('gp@x');
await prueba('Gerencia de Producción no lo ve', async () => {
  const n = await uno(`select count(*)::int n from gmp.estudios_estabilidad`);
  if (n.n !== 0) throw new Error(`ve ${n.n}`);
});
await rechaza(
  'Gerencia de Producción no abre estudios',
  `insert into gmp.estudios_estabilidad (producto, fecha_inicio) values ('X', '2026-11-05')`,
  /row-level security/,
);

await como('dt@x');
await prueba('la DT lo cierra con conclusión, a su nombre', async () => {
  await q(
    `update gmp.estudios_estabilidad set conclusion='Estable a 90 días.', cerrado_en='2000-01-01' where id=$1`,
    [est],
  );
  const r = await uno(
    `select e.cerrado_en > now() - interval '1 minute' reciente, u.email
       from gmp.estudios_estabilidad e join core.usuarios u on u.id = e.cerrado_por where e.id=$1`,
    [est],
  );
  if (!r.reciente || r.email !== 'dt@x') throw new Error(JSON.stringify(r));
});
await rechaza(
  'cerrado, la conclusión no cambia',
  `update gmp.estudios_estabilidad set conclusion='otra' where id='${est}'`,
  /está cerrado/,
);
await rechaza(
  'cerrado, los resultados no cambian',
  `update gmp.estabilidad_parametros set dia_90='7' where id='${par}'`,
  /está cerrado/,
);
await rechaza(
  'cerrado, no se agregan parámetros',
  `insert into gmp.estabilidad_parametros (estudio_id, parametro) values ('${est}', 'Olor')`,
  /está cerrado/,
);
await rechaza(
  'no se borra',
  `delete from gmp.estabilidad_parametros where id='${par}'`,
  /permission denied/,
);

await prueba('cada cambio queda auditado', async () => {
  await db.exec('reset role');
  const a = await uno(
    `select count(*)::int n from core.auditoria where tabla='estabilidad_parametros' and registro_id=$1`,
    [par],
  );
  if (a.n < 2) throw new Error(`solo ${a.n} filas`);
});
await invariantes();
fin();
