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
await q('select 1');
await invariantes();
fin();
