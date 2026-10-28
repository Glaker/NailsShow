// Transferir varios productos juntos (20261028160000): todo o nada.
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await como('naza@x');
const [a, b] = (await q(`select id from gmp.productos order by codigo_interno limit 2`)).map(
  (r) => r.id,
);
const PTF = (await uno(`select id from gmp.depositos where numero='PTF'`)).id;
for (const p of [a, b])
  await q(
    `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo) values ($1,$2,'ENTRADA_AJUSTE',10,'saldo inicial')`,
    [p, PTF],
  );
const en = async (dep, p) =>
  Number(
    (
      await uno(
        `select coalesce(sum(m.cantidad),0) s from comercial.movimientos_pt m join gmp.depositos d on d.id=m.deposito_id where d.numero=$1 and m.producto_id=$2`,
        [dep, p],
      )
    ).s,
  );
const varios = (r) =>
  `select comercial.transferir_pt_varios('${JSON.stringify(r)}'::jsonb, 'PTF', 'BER')`;

await rechaza(
  'si a uno no le alcanza, no se mueve ninguno',
  varios([
    { producto_id: a, cantidad: 4 },
    { producto_id: b, cantidad: 11 },
  ]),
  /No alcanza/,
);
await prueba('…y el primero sigue en la fábrica', async () => {
  if ((await en('PTF', a)) !== 10 || (await en('BER', a)) !== 0) throw new Error('se movió');
});
await rechaza(
  'un producto repetido se rechaza',
  varios([
    { producto_id: a, cantidad: 1 },
    { producto_id: a, cantidad: 1 },
  ]),
  /una sola vez/,
);
await rechaza('sin productos no hay transferencia', varios([]), /al menos un producto/);
await prueba('los dos llegan a Berna', async () => {
  await q(
    varios([
      { producto_id: a, cantidad: 4 },
      { producto_id: b, cantidad: 6 },
    ]),
  );
  if ((await en('BER', a)) !== 4 || (await en('BER', b)) !== 6 || (await en('PTF', b)) !== 4)
    throw new Error('no llegó');
});
await invariantes();
fin();
