// Fase 5 del módulo de costos (20261009160000): cotizador.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('naza2@x', 'GERENCIA_PRODUCCION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('dt@x', 'DIRECCION_TECNICA');
const N = (x) => (x == null ? null : Number(x));
const cerca = (a, b, tol = 0.01) => Math.abs(N(a) - b) <= tol;

await invariantes();

await como('gaby@x');
await q(
  `insert into comercial.parametros_costo (costo_hora, margen_minimo, vigencia_cotizacion_dias) values (6000, 0.25, 7)`,
);

await como('naza@x');
const nueva = async (extra = {}) => {
  const c = {
    titulo: 'Protector solar para manos 60 g',
    fija: 'MARGEN',
    margen_objetivo: 0.3,
    vigencia_dias: 7,
    minutos_por_unidad: 2,
    ...extra,
  };
  const cols = Object.keys(c);
  return (
    await uno(
      `insert into comercial.cotizaciones (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(c),
    )
  ).id;
};
let cot;
await prueba(
  'insumo nuevo escrito a mano: $12.000 los 500 g con IVA = $19,834 el g neto',
  async () => {
    cot = await nueva();
    await q(
      `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, cantidad_presentacion, unidad_presentacion, incluye_iva, alicuota_iva)
           values ($1, 1, 'NUEVO', 'Óxido de zinc (ZnO)', 6, 'g', 12000, 500, 'g', true, 21)`,
      [cot],
    );
    const l = await uno(`select * from comercial.costear_cotizacion($1)`, [cot]);
    // 12.000 / 1,21 / 500 = 19,8347 por g; 6 g = 119,01.
    if (!cerca(l.precio_base, 19.8347, 1e-3) || !cerca(l.subtotal, 119.01) || l.falta)
      throw new Error(JSON.stringify(l));
  },
);
await prueba(
  'mL con precio por g sin densidad: la línea queda bloqueada, no se supone',
  async () => {
    await q(
      `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, cantidad_presentacion, unidad_presentacion, incluye_iva)
           values ($1, 2, 'NUEVO', 'Glicerina', 10, 'ml', 3000, 1, 'kg', false)`,
      [cot],
    );
    const l = await uno(
      `select * from comercial.costear_cotizacion($1) where orden = 2`,
      [cot],
    );
    if (l.subtotal !== null || !/densidad/.test(l.falta))
      throw new Error(JSON.stringify(l));
    await rechaza(
      'no se emite con una línea sin costo',
      `select comercial.emitir_cotizacion('${cot}')`,
      /sin costo/,
    );
    await q(
      `update comercial.cotizacion_lineas set densidad = 1.26 where cotizacion_id = $1 and orden = 2`,
      [cot],
    );
    const l2 = await uno(
      `select * from comercial.costear_cotizacion($1) where orden = 2`,
      [cot],
    );
    // 10 mL × 1,26 = 12,6 g × $3 = 37,80.
    if (!cerca(l2.subtotal, 37.8)) throw new Error(JSON.stringify(l2));
  },
);
await prueba('costo libre con merma: importe / (1 − merma)', async () => {
  await q(
    `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva, merma)
           values ($1, 3, 'LIBRE', 'Flete', 1, 'unidad', 90, false, 0.1)`,
    [cot],
  );
  const l = await uno(
    `select subtotal from comercial.costear_cotizacion($1) where orden = 3`,
    [cot],
  );
  if (!cerca(l.subtotal, 100)) throw new Error(JSON.stringify(l));
});
await prueba(
  'margen sobre precio 30 % = recargo 42,9 %; emitir congela, numera y vence',
  async () => {
    const n = await uno(`select comercial.emitir_cotizacion($1) n`, [cot]);
    const c = await uno(`select * from comercial.cotizaciones where id=$1`, [cot]);
    // Materiales 119,01 + 37,80 + 100 = 256,81; MO 2 min × 6000/60 = 200 → 456,81. P = 456,81 / 0,7 = 652,59 → 653.
    if (
      n.n !== 1 ||
      c.estado !== 'EMITIDA' ||
      !cerca(c.costo_unitario, 456.81) ||
      N(c.precio_unitario) !== 653
    )
      throw new Error(JSON.stringify(c));
    if (!cerca(c.foto.recargo_sobre_costo, 653 / 456.81 - 1, 1e-4) || !c.vence_el)
      throw new Error(JSON.stringify(c.foto));
  },
);
await prueba('el PDF no lleva costos, márgenes ni composición', async () => {
  const c = await uno(`select foto from comercial.cotizaciones where id=$1`, [cot]);
  const pdf = JSON.stringify(c.foto.pdf);
  for (const prohibido of [
    'costo',
    'margen',
    'recargo',
    'lineas',
    'Óxido',
    'merma',
    'mano_de_obra',
  ])
    if (pdf.includes(prohibido)) throw new Error(`${prohibido} en el PDF: ${pdf}`);
  if (N(c.foto.pdf.precio_unitario) !== 653 || c.foto.pdf.emitida_por === undefined)
    throw new Error(pdf);
});
await rechaza(
  'una emitida no se edita',
  `update comercial.cotizaciones set titulo = 'otro' where id = '${cot}'`,
  /no se edita/,
);
await rechaza(
  'ni sus líneas',
  `update comercial.cotizacion_lineas set cantidad = 1 where cotizacion_id = '${cot}'`,
  /ya se emitió/,
);

let segunda;
await prueba(
  'duplicar: la nueva es borrador con las mismas líneas; la original queda',
  async () => {
    segunda = (await uno(`select comercial.duplicar_cotizacion($1) id`, [cot])).id;
    const l = await uno(
      `select count(*)::int n from comercial.cotizacion_lineas where cotizacion_id=$1`,
      [segunda],
    );
    const o = await uno(`select estado from comercial.cotizaciones where id=$1`, [cot]);
    if (l.n !== 3 || o.estado !== 'EMITIDA') throw new Error(JSON.stringify({ l, o }));
  },
);
await rechaza(
  'nadie la emite a mano',
  `update comercial.cotizaciones set estado = 'EMITIDA' where estado = 'BORRADOR'`,
  /emitir_cotizacion/,
);
await prueba(
  'margen bajo el mínimo: pide justificación; con ella emite y numera el siguiente',
  async () => {
    await q(`update comercial.cotizaciones set margen_objetivo = 0.1 where id=$1`, [
      segunda,
    ]);
    let fallo = null;
    try {
      await db.exec('savepoint j');
      await q(`select comercial.emitir_cotizacion($1)`, [segunda]);
    } catch (e) {
      fallo = e.message;
    } finally {
      await db.exec('rollback to savepoint j');
    }
    if (!/justificación|por qué/.test(fallo ?? ''))
      throw new Error('no pidió justificación: ' + fallo);
    const n = await uno(
      `select comercial.emitir_cotizacion($1, 'Cliente nuevo, entrada al mercado') n`,
      [segunda],
    );
    if (n.n !== 2) throw new Error(JSON.stringify(n));
  },
);
await prueba('anular pide motivo y deja la cotización en el historial', async () => {
  await q(
    `select comercial.anular_cotizacion($1, 'El cliente pidió otra presentación')`,
    [segunda],
  );
  const c = await uno(
    `select estado, motivo_anulacion from comercial.cotizaciones where id=$1`,
    [segunda],
  );
  if (c.estado !== 'ANULADA') throw new Error(JSON.stringify(c));
});

await prueba('copiar un producto existente cuesta lo mismo que en su panel', async () => {
  await db.exec('reset role');
  const p = (
    await uno(
      `select id from gmp.productos p where activo and exists (select 1 from gmp.materiales_acondicionamiento m where m.producto_id = p.id and m.activo) limit 1`,
    )
  ).id;
  await como('naza@x');
  const c = await nueva({ titulo: 'Copia', incluir_mano_obra: false });
  await q(`select comercial.lineas_desde_producto($1, $2)`, [c, p]);
  const cot = await uno(
    `select coalesce(sum(subtotal),0) s from comercial.costear_cotizacion($1)`,
    [c],
  );
  const pan = await uno(
    `select coalesce(sum(subtotal),0) s from comercial.costo_producto($1) where tipo <> 'MANO_DE_OBRA' and insumo_id is not null and cantidad > 0`,
    [p],
  );
  if (!cerca(cot.s, N(pan.s), 0.05)) throw new Error(JSON.stringify({ cot, pan }));
});

await prueba('cada uno ve las suyas; Finanzas ve todas; Ventas, ninguna', async () => {
  await como('naza2@x');
  const a = await uno(`select count(*)::int n from comercial.cotizaciones`);
  await como('gaby@x');
  const b = await uno(`select count(*)::int n from comercial.cotizaciones`);
  await como('mati@x');
  const c = await uno(`select count(*)::int n from comercial.cotizaciones`);
  if (a.n !== 0 || b.n < 3 || c.n !== 0) throw new Error(JSON.stringify({ a, b, c }));
});
await como('mati@x');
await rechaza(
  'Ventas no cotiza',
  `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias) values ('x','MARGEN',0.3,7)`,
  /row-level|policy/,
);

await prueba('cliente potencial y uso interno', async () => {
  await como('naza@x');
  const pot = (
    await uno(
      `insert into comercial.clientes_potenciales (razon_social, contacto) values ('Spa del Bosque', 'Laura, 221 555') returning id`,
    )
  ).id;
  const c = await nueva({
    titulo: 'Para Spa',
    destino: 'POTENCIAL',
    cliente_potencial_id: pot,
  });
  await q(
    `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva) values ($1,1,'LIBRE','Servicio',1,'unidad',500,false)`,
    [c],
  );
  await q(`select comercial.emitir_cotizacion($1)`, [c]);
  const f = await uno(`select foto from comercial.cotizaciones where id=$1`, [c]);
  if (
    f.foto.pdf.cliente.razon_social !== 'Spa del Bosque' ||
    f.foto.pdf.destino !== 'POTENCIAL'
  )
    throw new Error(JSON.stringify(f.foto.pdf));
});
await rechaza(
  'cliente potencial sin indicar cuál',
  `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias, destino) values ('x','MARGEN',0.3,7,'POTENCIAL')`,
  /destino/,
);

await prueba('proponer para el catálogo: llega a la DT y no toca gmp', async () => {
  await como('naza@x');
  const antes = (await uno(`select count(*)::int n from gmp.insumos_catalogo`)).n;
  const l = (
    await uno(`select id from comercial.cotizacion_lineas where tipo = 'NUEVO' limit 1`)
  ).id;
  await q(
    `insert into comercial.solicitudes_catalogo (cotizacion_linea_id, nombre, detalle) values ($1, 'Óxido de zinc', 'Para protector solar')`,
    [l],
  );
  await como('dt@x');
  const s = await uno(
    `select count(*)::int n from comercial.solicitudes_catalogo where estado = 'PENDIENTE'`,
  );
  const despues = (await uno(`select count(*)::int n from gmp.insumos_catalogo`)).n;
  if (s.n !== 1 || antes !== despues)
    throw new Error(JSON.stringify({ s, antes, despues }));
});

// Segunda revisión del cotizador.
await como('naza@x');
await rechaza(
  'nadie carga un borrador con número (trabaría la numeración)',
  `insert into comercial.cotizaciones (titulo, fija, margen_objetivo, vigencia_dias, numero, anio) values ('x','MARGEN',0.3,7,8,2026)`,
  /permission|privilegi/,
);
await prueba(
  'con IVA incluido, el PDF muestra el precio con IVA y redondeado; el neto queda adentro',
  async () => {
    const c2 = await nueva({
      titulo: 'Con IVA',
      leyenda_iva: 'IVA_INCLUIDO',
      incluir_mano_obra: false,
    });
    await q(
      `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva) values ($1,1,'LIBRE','Servicio',1,'unidad',456.81,false)`,
      [c2],
    );
    await q(`select comercial.emitir_cotizacion($1)`, [c2]);
    const c = await uno(
      `select precio_unitario, foto from comercial.cotizaciones where id=$1`,
      [c2],
    );
    // neto 456,81 / 0,7 = 652,59 → con IVA 789,63 → redondeado 790; neto 790 / 1,21 = 652,8926.
    if (
      N(c.foto.pdf.precio_unitario) !== 790 ||
      !cerca(c.precio_unitario, 652.8926, 1e-3)
    )
      throw new Error(JSON.stringify({ p: c.precio_unitario, pdf: c.foto.pdf }));
  },
);
await prueba('costo libre por cantidad: 3 × $50 = $150', async () => {
  const c3 = await nueva({ titulo: 'Libre x3' });
  await q(
    `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva) values ($1,1,'LIBRE','Análisis',3,'unidad',50,false)`,
    [c3],
  );
  const l = await uno(`select subtotal from comercial.costear_cotizacion($1)`, [c3]);
  if (!cerca(l.subtotal, 150)) throw new Error(JSON.stringify(l));
});
await prueba(
  'anular: quién y cuándo los pone la base aunque se manden otros',
  async () => {
    const e = (
      await uno(
        `select id from comercial.cotizaciones where estado = 'EMITIDA' and creado_por = core.usuario_actual() limit 1`,
      )
    ).id;
    await q(
      `update comercial.cotizaciones set estado = 'ANULADA', motivo_anulacion = 'prueba' where id=$1`,
      [e],
    );
    const c = await uno(
      `select anulada_por, anulada_en from comercial.cotizaciones where id=$1`,
      [e],
    );
    const yo = (await uno(`select core.usuario_actual() u`)).u;
    if (c.anulada_por !== yo || Math.abs(new Date(c.anulada_en) - Date.now()) > 600000)
      throw new Error(JSON.stringify(c));
  },
);
await prueba('una solicitud nace pendiente aunque se mande atendida', async () => {
  const l = (
    await uno(`select id from comercial.cotizacion_lineas where tipo = 'NUEVO' limit 1`)
  ).id;
  let err = null;
  try {
    await db.exec('savepoint s1');
    await q(
      `insert into comercial.solicitudes_catalogo (cotizacion_linea_id, nombre, estado) values ($1,'x','ATENDIDA')`,
      [l],
    );
  } catch (e) {
    err = e.message;
  } finally {
    await db.exec('rollback to savepoint s1');
  }
  if (!/permission|privilegi/.test(err ?? '')) throw new Error('no rechazó: ' + err);
});

// 20261029130000: Dirección Técnica también cotiza (D-cotiza-dt-1).
await usuario('dt2@x', 'DIRECCION_TECNICA');
await como('dt@x');
let cotDt;
await prueba('la DT cotiza con un componente a mano y la emite', async () => {
  cotDt = await nueva({ titulo: 'Cotización de la DT' });
  await q(
    `insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, cantidad_presentacion, unidad_presentacion, incluye_iva)
         values ($1, 1, 'NUEVO', 'Extracto que pongo yo', 5, 'g', 1000, 100, 'g', false)`,
    [cotDt],
  );
  const n = await uno(`select comercial.emitir_cotizacion($1) n`, [cotDt]);
  if (!(N(n.n) > 0)) throw new Error(JSON.stringify(n));
});
await prueba('la DT lee los costos que usa el cotizador', async () => {
  await q(`select * from comercial.v_costo_referencia limit 1`);
  const p = await uno(`select costo_hora from comercial.v_parametros_costo`);
  if (N(p.costo_hora) !== 6000) throw new Error(JSON.stringify(p));
});
await prueba('otra cuenta de DT no ve la cotización ajena', async () => {
  await como('dt2@x');
  const r = await q(`select id from comercial.cotizaciones where id = $1`, [cotDt]);
  if (r.length !== 0) throw new Error('la ve');
});

await invariantes();
fin();
