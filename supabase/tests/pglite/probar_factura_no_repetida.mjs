// Una factura no se carga dos veces (20261125140000): mismo PDF (huella) o
// mismo comprobante con el número escrito distinto; el stock baja una sola vez.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('agus@x', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
const N = (x) => Number(x ?? 0);
const p101 = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const BER = (await uno(`select id from gmp.depositos where numero='BER'`)).id;
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por)
   values ($1,$2,'ENTRADA_DEVOLUCION',20,'stock de prueba',(select id from core.usuarios where email='naza@x'))`,
  [p101, BER],
);
await db.exec('set session_replication_role = origin');
const saldo = async () =>
  N(
    (
      await uno(
        `select sum(cantidad) s from comercial.movimientos_pt where producto_id=$1 and deposito_id=$2`,
        [p101, BER],
      )
    ).s,
  );
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const fact = (numero, sha) =>
  JSON.stringify({
    numero,
    tipo: 'X',
    emisor_cuit: '27-30958059-7',
    canal: 'MINORISTA',
    fecha: '2026-11-20',
    cliente: 'CLIENTE OCASIONAL',
    total: 100,
    pdf_sha256: sha,
    renglones: [{ codigo: '101', cantidad: 2, descripcion: '101' }],
  });
const cargar = (numero, sha) =>
  `select comercial.cargar_factura_venta('${fact(numero, sha)}'::jsonb)`;

await como('agus@x');
await prueba('la primera carga baja 2', async () => {
  await q(cargar('0008-00002818', H1));
  if ((await saldo()) !== 18) throw new Error(String(await saldo()));
});
await como('naza@x');
await rechaza(
  'el mismo PDF con otro número leído',
  cargar('0008-00009999', H1),
  /ya está cargada/,
);
await rechaza(
  'el mismo número sin ceros, otro PDF',
  cargar('8-2818', H2),
  /ya está cargada/,
);
await prueba('el stock bajó una sola vez', async () => {
  if ((await saldo()) !== 18) throw new Error(String(await saldo()));
});
await prueba('aviso antes de confirmar: dice quién y que es el mismo PDF', async () => {
  const r = await uno(
    `select * from comercial.factura_ya_cargada($1, 'X', '27-30958059-7', '0008-02818')`,
    [H1],
  );
  if (!r || r.cargada_por !== 'agus@x' || r.pdf_igual !== true)
    throw new Error(JSON.stringify(r));
});
await prueba('otra factura sí entra', async () => {
  await q(cargar('0008-00002819', H2));
  if ((await saldo()) !== 16) throw new Error(String(await saldo()));
});
await prueba('normalizado', async () => {
  const r = await uno(
    `select comercial.numero_comprobante_normalizado('0008-00002818') a,
            comercial.numero_comprobante_normalizado(' 00100-0005862 ') b,
            comercial.numero_comprobante_normalizado('0000-0000') c`,
  );
  if (r.a !== '8-2818' || r.b !== '100-5862' || r.c !== '0-0')
    throw new Error(JSON.stringify(r));
});

await invariantes();
fin();
