// 20261127130000: una cotización con varios productos.
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('naza2@x', 'GERENCIA_PRODUCCION');
const N = (x) => (x == null ? null : Number(x));

await como('gaby@x');
await q(`insert into comercial.parametros_costo (costo_hora, margen_minimo, vigencia_cotizacion_dias) values (6000, 0.25, 7)`);

await como('naza@x');
const libre = (id, importe) =>
  q(
    `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva)
     values ($1, 1, 'LIBRE', 'Componente', 1, 'unidad', $2, false)`,
    [id, importe],
  );
const principal = (
  await uno(
    `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias, incluir_mano_obra, cantidad_cotizada)
     values ('Crema 60 g', 'MARGEN', 0.5, 7, false, 10) returning id`,
  )
).id;
await libre(principal, 100);
let hijo;
await prueba('agregar un producto: borrador nuevo apuntando a la principal', async () => {
  hijo = (await uno(`select comercial.agregar_producto_cotizacion($1) id`, [principal])).id;
  await q(`update comercial.cotizaciones set titulo = 'Gel 30 g', cantidad_cotizada = 5 where id = $1`, [hijo]);
  await libre(hijo, 50);
  const c = await uno(`select * from comercial.cotizaciones where id = $1`, [hijo]);
  if (c.cotizacion_principal_id !== principal || c.estado !== 'BORRADOR') throw new Error(JSON.stringify(c));
});
await rechaza(
  'cotizacion_principal_id no se escribe desde la API',
  `update comercial.cotizaciones set cotizacion_principal_id = null where id = '${hijo}'`,
  /permission denied|permiso/,
);
await rechaza('no se agrega a un producto agregado', `select comercial.agregar_producto_cotizacion('${hijo}')`, /no sea/);
await rechaza('un producto agregado no se emite solo', `select comercial.emitir_cotizacion('${hijo}')`, /principal/);
await como('naza2@x');
await rechaza('ni se agrega a una cotización ajena', `select comercial.agregar_producto_cotizacion('${principal}')`, /tuya/);
await como('naza@x');

const IMG = 'data:image/jpeg;base64,/9j/4AAQ';
await prueba('imagen: se carga en el borrador', async () => {
  await q(`insert into comercial.cotizacion_imagenes (cotizacion_id, nombre, datos) values ($1, 'foto.jpg', $2)`, [
    principal,
    IMG,
  ]);
});
await rechaza(
  'imagen: sólo data URL de imagen',
  `insert into comercial.cotizacion_imagenes (cotizacion_id, datos) values ('${principal}', 'https://x/y.jpg')`,
  /check/,
);

await prueba('emitir: un número para los dos y el PDF con los dos productos', async () => {
  const n = (await uno(`select comercial.emitir_cotizacion($1) n`, [principal])).n;
  const p = await uno(`select * from comercial.cotizaciones where id = $1`, [principal]);
  const h = await uno(`select * from comercial.cotizaciones where id = $1`, [hijo]);
  if (h.estado !== 'EMITIDA' || h.numero !== n || p.numero !== n) throw new Error(JSON.stringify([p, h]));
  const items = p.foto.pdf.items;
  // 100 / 0,5 = 200 × 10 = 2000; 50 / 0,5 = 100 × 5 = 500.
  if (items.length !== 2 || items[0].titulo !== 'Crema 60 g' || items[1].titulo !== 'Gel 30 g')
    throw new Error(JSON.stringify(items));
  if (N(items[1].total) !== 500 || N(p.foto.pdf.total_general) !== 2500)
    throw new Error(JSON.stringify(p.foto.pdf));
  const pdf = JSON.stringify(p.foto.pdf);
  for (const prohibido of ['costo', 'margen', 'lineas']) if (pdf.includes(prohibido)) throw new Error(prohibido);
});
await rechaza(
  'imagen: emitida, no se agregan',
  `insert into comercial.cotizacion_imagenes (cotizacion_id, datos) values ('${principal}', '${IMG}')`,
  /ya se emitió/,
);
await rechaza(
  'imagen: emitida, no se quitan',
  `update comercial.cotizacion_imagenes set anulada = true where cotizacion_id = '${principal}'`,
  /ya se emitió/,
);
await prueba('otra cotización sola sigue numerando aparte', async () => {
  const otra = (
    await uno(
      `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias, incluir_mano_obra)
       values ('Suelta', 'MARGEN', 0.5, 7, false) returning id`,
    )
  ).id;
  await libre(otra, 10);
  const n = (await uno(`select comercial.emitir_cotizacion($1) n`, [otra])).n;
  const p = await uno(`select foto from comercial.cotizaciones where id = $1`, [otra]);
  if (n !== 2 || p.foto.pdf.items !== undefined || N(p.foto.pdf.total) !== 20) throw new Error(JSON.stringify(p));
});
await prueba('duplicar copia los dos productos como borrador', async () => {
  const d = (await uno(`select comercial.duplicar_cotizacion($1) id`, [hijo])).id;
  const r = await q(
    `select titulo, estado, cotizacion_principal_id from comercial.cotizaciones where id = $1 or cotizacion_principal_id = $1 order by titulo`,
    [d],
  );
  if (r.length !== 2 || r.some((x) => x.estado !== 'BORRADOR') || r[1].cotizacion_principal_id !== d)
    throw new Error(JSON.stringify(r));
  const im = await q(`select 1 from comercial.cotizacion_imagenes where cotizacion_id = $1`, [d]);
  if (im.length !== 1) throw new Error('no copió la imagen');
});
await rechaza('un producto agregado no se anula solo', `select comercial.anular_cotizacion('${hijo}', 'x')`, /principal/);
await prueba('anular la principal anula sus productos', async () => {
  await q(`select comercial.anular_cotizacion($1, 'El cliente no siguió')`, [principal]);
  const h = await uno(`select estado from comercial.cotizaciones where id = $1`, [hijo]);
  if (h.estado !== 'ANULADA') throw new Error(JSON.stringify(h));
});
await prueba('quitar un producto lo deja como borrador suelto', async () => {
  const p = (
    await uno(
      `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias) values ('P', 'MARGEN', 0.5, 7) returning id`,
    )
  ).id;
  const h = (await uno(`select comercial.agregar_producto_cotizacion($1) id`, [p])).id;
  await q(`select comercial.quitar_producto_cotizacion($1)`, [h]);
  const c = await uno(`select cotizacion_principal_id from comercial.cotizaciones where id = $1`, [h]);
  if (c.cotizacion_principal_id !== null) throw new Error(JSON.stringify(c));
});

await invariantes();
fin();
