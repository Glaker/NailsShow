// Anular una factura de venta cargada por error (20261127150000): el stock
// vuelve con movimientos inversos y la factura se puede cargar de nuevo.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('diego@x', 'ADMINISTRACION');
await usuario('johana@x', 'DESPACHO');
await usuario('cc@x', 'CONTROL_CALIDAD');
const N = (x) => Number(x ?? 0);
const p101 = (await uno(`select id from gmp.productos where codigo_interno='101'`)).id;
const BER = (await uno(`select id from gmp.depositos where numero='BER'`)).id;
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(
  `insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, registrado_por)
   values ($1,$2,'ENTRADA_DEVOLUCION',20,'stock de prueba',(select id from core.usuarios where email='diego@x'))`,
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
const cargar = (cantidad) =>
  `select comercial.cargar_factura_venta('${JSON.stringify({
    numero: '00100-00005868',
    tipo: 'X',
    emisor_cuit: '27-30958059-7',
    canal: 'MINORISTA',
    fecha: '2026-11-26',
    cliente: 'BELLA CENTRAL',
    total: 100,
    pdf_sha256: H1,
    renglones: [{ codigo: '101', cantidad, descripcion: '101' }],
  })}'::jsonb) r`;

await como('diego@x');
let f1;
await prueba('carga mal: baja 25 de 20 (5 quedan sin lote para contar)', async () => {
  f1 = (await uno(cargar(25))).r.factura_id;
  if ((await saldo()) !== -5) throw new Error(String(await saldo()));
});
await como('cc@x');
await rechaza(
  'quien no carga facturas no la anula',
  `select comercial.anular_factura_venta('${f1}', 'x')`,
  /Despacho, Ventas/,
);
await como('johana@x');
await rechaza('sin motivo, no', `select comercial.anular_factura_venta('${f1}', ' ')`, /por qué/);
await rechaza(
  'la factura sigue sin poder editarse',
  `update comercial.facturas_x set cliente = 'otro' where id = '${f1}'`,
  /permission denied|no se modifica/,
);
await prueba('anular: el stock vuelve a 20 y queda quién y por qué', async () => {
  const n = (await uno(`select comercial.anular_factura_venta($1, 'Cantidad mal cargada') n`, [f1])).n;
  if (n < 1 || (await saldo()) !== 20) throw new Error(`${n} ${await saldo()}`);
  const f = await uno(
    `select motivo_anulacion, anulada_por = core.usuario_actual() as yo from comercial.facturas_x where id = $1`,
    [f1],
  );
  if (!f.yo || f.motivo_anulacion !== 'Cantidad mal cargada') throw new Error(JSON.stringify(f));
});
await rechaza('no se anula dos veces', `select comercial.anular_factura_venta('${f1}', 'otra vez')`, /ya está anulada/);
await prueba('la misma factura (mismo número y PDF) se vuelve a cargar bien', async () => {
  const r = await uno(`select * from comercial.factura_ya_cargada($1, 'X', '27-30958059-7', '00100-00005868')`, [H1]);
  if (r) throw new Error('avisa como cargada: ' + JSON.stringify(r));
  await como('diego@x');
  await q(cargar(2));
  if ((await saldo()) !== 18) throw new Error(String(await saldo()));
});
await rechaza('y la correcta ya no se repite', cargar(2), /ya está cargada/);

await invariantes();
fin();
