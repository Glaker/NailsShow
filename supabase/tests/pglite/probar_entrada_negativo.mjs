// Una entrada no se frena por un saldo negativo heredado; una salida sí
// (20261118140000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const p = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const dep = async (n) => (await uno(`select id from gmp.depositos where numero=$1`, [n])).id;
const [PTF, BER] = [await dep('PTF'), await dep('BER')];
const saldo = async (d) =>
  Number(
    (await uno(`select coalesce(sum(cantidad),0) s from comercial.movimientos_pt where producto_id=$1 and deposito_id=$2`, [p, d])).s,
  );

await db.exec('reset role');
await db.exec('set session_replication_role = replica');
const naza = `(select id from core.usuarios where email='naza@x')`;
await q(`insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por) values ($1,$2,'ENTRADA_DEVOLUCION',72,'stock',${naza}), ($1,$3,'SALIDA_AJUSTE',-73,'venta sin stock',${naza})`, [p, PTF, BER]);
await db.exec('set session_replication_role = origin');

await como('naza@x');
await prueba('manda 72 de la fábrica a Berna, que estaba en −73', async () => {
  await q(`select comercial.transferir_pt_varios($1::jsonb, 'PTF', 'BER')`, [
    JSON.stringify([{ producto_id: p, cantidad: 72 }]),
  ]);
  if ((await saldo(BER)) !== -1 || (await saldo(PTF)) !== 0)
    throw new Error(`${await saldo(BER)} ${await saldo(PTF)}`);
});
await rechaza(
  'de Berna en negativo no sale nada',
  `select comercial.transferir_pt('${p}', 1, 'BER', 'PTF')`,
  /alcanza|no hay/,
);

await invariantes();
fin();
