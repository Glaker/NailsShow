// Remitos de producto terminado (20261028150000, D-remito-1): interno «X»,
// número correlativo por punto de venta, sin edición ni borrado.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('mati@x', 'VENTAS');
await usuario('op@x', 'OPERARIO');

const emitir = (receptor, renglones) =>
  uno(`select * from comercial.emitir_remito($1::jsonb, $2::jsonb)`, [
    JSON.stringify({ motivo: 'TRANSFERENCIA', receptor_nombre: receptor }),
    JSON.stringify(renglones),
  ]);
const renglon = [
  { codigo: 'REM200', descripcion: 'Removedor 200 ml', bultos: 2, cantidad: 48 },
];

await como('naza@x');
let r1;
await prueba('Naza emite el primero: X 0001-00000001, a su nombre', async () => {
  r1 = await emitir('Depósito Berna', renglon);
  const yo = (await uno(`select core.usuario_actual() u`)).u;
  if (
    r1.letra !== 'X' ||
    r1.punto_venta !== 1 ||
    r1.numero !== 1 ||
    r1.confeccionado_por !== yo
  )
    throw new Error(JSON.stringify(r1));
});
await como('mati@x');
await prueba('Mati emite el siguiente, sin huecos', async () => {
  const r2 = await emitir('Cliente Ana', renglon);
  if (r2.numero !== 2) throw new Error(String(r2.numero));
});
await rechaza(
  'sin renglones no hay remito',
  `select comercial.emitir_remito('{"motivo":"SALIDA","receptor_nombre":"X"}', '[]')`,
  /al menos un renglón/,
);
await rechaza(
  'y si falla, el número no se consume',
  `select comercial.emitir_remito('{"motivo":"SALIDA","receptor_nombre":"X"}', '[{"descripcion":"","cantidad":1}]')`,
  /check/,
);
await prueba('el que sigue es el 3', async () => {
  const r3 = await emitir('Cliente Bea', renglon);
  if (r3.numero !== 3) throw new Error(String(r3.numero));
});
await rechaza(
  'un «R» sin CAI no se emite',
  `select comercial.emitir_remito('{"letra":"R","motivo":"SALIDA","receptor_nombre":"X"}', '${JSON.stringify(renglon)}')`,
  /remitos_r_con_cai/,
);
await rechaza(
  'no se edita',
  `update comercial.remitos set receptor_nombre = 'otro' where id = '${r1.id}'`,
  /permission denied/,
);
await rechaza(
  'no se borra',
  `delete from comercial.remitos where id = '${r1.id}'`,
  /permission denied/,
);
await rechaza(
  'un renglón no se agrega después',
  `insert into comercial.remito_renglones (remito_id, orden, descripcion, cantidad) values ('${r1.id}', 9, 'agregado', 1)`,
  /row-level security/,
);
await como('op@x');
await rechaza(
  'un operario no emite',
  `select comercial.emitir_remito('{"motivo":"SALIDA","receptor_nombre":"X"}', '${JSON.stringify(renglon)}')`,
  /row-level security/,
);
await invariantes();
fin();
