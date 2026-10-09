// Prueba los datos de la base de práctica (scripts/practica/datos_practica.sql)
// sobre una base reconstruida en PGlite: que cargan sin errores y que dejan
// lo que Administración necesita para practicar. No toca ninguna base real.
import { readFileSync } from 'node:fs';
import { banco } from './lib.mjs';
const { db, q, uno, prueba, fin, invariantes } = await banco();
const N = (x) => Number(x ?? 0);

await prueba('los datos de práctica cargan sin errores', async () => {
  await db.exec('reset role');
  await db.exec(
    readFileSync(
      new URL('../../../scripts/practica/datos_practica.sql', import.meta.url),
      'utf8',
    ),
  );
});
await prueba(
  'quedan cajas con saldo, proveedores con deuda y clientes con facturas',
  async () => {
    const cajas = await uno(
      `select count(*)::int n, sum(saldo) s from comercial.v_saldos_fondos`,
    );
    const prov = await uno(
      `select count(*)::int n from comercial.v_saldos_proveedores where saldo > 0`,
    );
    const fac = await uno(
      `select count(*)::int n from comercial.facturas where estado='AUTORIZADA' and ambiente='PRODUCCION'`,
    );
    const cobros = await uno(`select count(*)::int n from comercial.cobros_cliente`);
    const sol = await uno(
      `select count(*)::int n from comercial.solicitudes_pago where estado='PENDIENTE'`,
    );
    if (
      cajas.n !== 4 ||
      N(cajas.s) <= 0 ||
      prov.n < 2 ||
      fac.n !== 4 ||
      cobros.n !== 2 ||
      sol.n !== 1
    )
      throw new Error(JSON.stringify({ cajas, prov, fac, cobros, sol }));
  },
);
await prueba('correrlo dos veces no duplica nada', async () => {
  await db.exec(
    readFileSync(
      new URL('../../../scripts/practica/datos_practica.sql', import.meta.url),
      'utf8',
    ),
  );
  const c = await uno(`select count(*)::int n from comercial.cuentas_fondos`);
  if (c.n !== 4) throw new Error(String(c.n));
});
await prueba('costos de práctica: series, insumos con compras, aviso y productos costeados', async () => {
  await db.exec('reset role');
  const costos = readFileSync(new URL('../../../scripts/practica/datos_practica_costos.sql', import.meta.url), 'utf8');
  await db.exec(costos);
  await db.exec(costos); // dos veces no duplica
  const s = await uno(`select count(*) filter (where serie='IPC')::int ipc, count(*)::int n from comercial.series_macro`);
  const o = await q(`select origen, count(*)::int n from comercial.v_costo_referencia where codigo_interno in (select i.codigo_interno from gmp.insumos_catalogo i join gmp.lotes_insumo l on l.insumo_id=i.id join gmp.recepciones r on r.id=l.recepcion_id where r.numero_remito like 'PR-%') group by 1`);
  const av = await uno(`select count(*)::int n from comercial.avisos_costo`);
  const sc = await uno(`select count(*)::int n from comercial.costos_lote where tipo_comprobante='SIN_COMPROBANTE'`);
  const pr = await q(`select nombre, costo_unitario, faltantes from comercial.v_costo_producto where contenido_neto is not null`);
  const porOrigen = Object.fromEntries(o.map((x) => [x.origen, x.n]));
  if (s.ipc !== 12 || s.n !== 36 || !(porOrigen.MANUAL >= 1) || !(porOrigen.ULTIMO_LOTE >= 1)
      || (porOrigen.MANUAL ?? 0) + (porOrigen.ULTIMO_LOTE ?? 0) < 8 || av.n < 1 || sc.n < 1
      || pr.length < 3 || !pr.every((x) => N(x.costo_unitario) > 0))
    throw new Error(JSON.stringify({ s, o, av, sc, pr }));
});
await prueba('la siembra de práctica se niega a correr en una base con la cuenta real de Nazarena', async () => {
  await db.exec('reset role');
  await db.exec('savepoint g');
  try {
    await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector) values ('N','naza@nailshow.com','GERENCIA_PRODUCCION','PRODUCCION')`);
    await db.exec(readFileSync(new URL('../../../scripts/practica/datos_practica_costos.sql', import.meta.url), 'utf8'));
    throw new Error('no se negó');
  } catch (e) {
    if (!/parece la REAL/.test(e.message)) throw e;
  } finally {
    await db.exec('rollback to savepoint g');
  }
});
await q('select 1');
await invariantes();
fin();
