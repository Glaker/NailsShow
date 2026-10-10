// Fase 4 del módulo de costos (20261009150000): Pareto ABC con margen,
// rotación de insumos, precios por proveedor y alertas de precio.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('gaby@x', 'FINANZAS', 'ADMINISTRACION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await usuario('diego@x', 'ADMINISTRACION', 'ADMINISTRACION');
const N = (x) => (x == null ? null : Number(x));
const cerca = (a, b, tol = 1e-4) => Math.abs(N(a) - b) <= tol;

await invariantes();

// Una factura autorizada en producción con 5 productos de facturación muy
// despareja: 7.000, 1.500, 800, 450, 250 (total 10.000).
await db.exec('reset role');
await q(`update comercial.configuracion_fiscal set vigente = false where vigente`);
await q(`insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, razon_social, condicion_iva)
         values ('PRODUCCION', '30711111111', 9, 'Nail Show SRL (prueba)', 'RESPONSABLE_INSCRIPTO')`);
const prods = (await q(`select id from gmp.productos where activo order by codigo_interno limit 5`)).map((r) => r.id);
await como('diego@x');
const cli = (await uno(`insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento) values ('Belleza SRL','RESPONSABLE_INSCRIPTO','CUIT','30715555553') returning id`)).id;
const ped = (await uno(`insert into comercial.pedidos (numero, cliente, cliente_id) values ('P-PA','Belleza SRL',$1) returning id`, [cli])).id;
const montos = [7000, 1500, 800, 450, 250];
for (let i = 0; i < 5; i++)
  await q(`insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values ($1,$2,1,$3)`, [ped, prods[i], montos[i]]);
await q(`update comercial.pedidos set estado='CONFIRMADO' where id=$1`, [ped]);
await q(`select comercial.preparar_factura($1)`, [ped]);
const fac = (await uno(`select id, fecha from comercial.facturas where pedido_id=$1`, [ped]));
await q(`select comercial.fijar_numero_factura($1, 77)`, [fac.id]);
await q(`select comercial.registrar_resultado_factura($1, '{}'::jsonb, $2::jsonb)`, [fac.id,
  JSON.stringify({ FECAESolicitarResult: { FeCabResp: { Resultado: 'A' }, FeDetResp: { FECAEDetResponse: [{ Resultado: 'A', CAE: '12345678901234', CAEFchVto: '20261231' }] } } })]);
const mes = (await uno(`select date_trunc('month', fecha)::date::text m from comercial.facturas where id=$1`, [fac.id])).m;
await db.exec('reset role');
// Costo del mes: el primero con margen del 10 % (bajo), los demás del 50 %; el último sin costo.
for (let i = 0; i < 4; i++)
  await q(`insert into comercial.fotos_costo_producto (mes, producto_id, costo_unitario, faltantes, detalle) values ($1,$2,$3,0,'[]')
           on conflict (mes, producto_id) do update set costo_unitario = excluded.costo_unitario, faltantes = 0`,
          [mes, prods[i], i === 0 ? 6300 : montos[i] / 2]);

await como('gaby@x');
await prueba('Pareto: A hasta el 80 %, B hasta el 95 %, C el resto', async () => {
  const p = await q(`select producto_id, clase, acumulado, participacion from comercial.pareto($1, $1)`, [mes]);
  const clase = Object.fromEntries(p.map((r) => [r.producto_id, r.clase]));
  // Acumulados: 70 %, 85 %, 93 %, 97,5 %, 100 %. El que cruza el 80 % (85 %) todavía es A.
  const esperado = ['A', 'A', 'B', 'B', 'C'];
  prods.forEach((id, i) => { if (clase[id] !== esperado[i]) throw new Error(JSON.stringify(p)); });
  if (!cerca(p[0].participacion, 0.7)) throw new Error(JSON.stringify(p[0]));
});
await prueba('margen por producto; sin costo no se inventa un margen', async () => {
  const p = await q(`select producto_id, margen_pct, costo_incompleto from comercial.pareto($1, $1)`, [mes]);
  const de = (id) => p.find((r) => r.producto_id === id);
  if (!cerca(de(prods[0]).margen_pct, 0.1) || !cerca(de(prods[1]).margen_pct, 0.5)) throw new Error(JSON.stringify(p));
  if (de(prods[4]).margen_pct !== null || !de(prods[4]).costo_incompleto) throw new Error(JSON.stringify(de(prods[4])));
});
await prueba('los cortes los cambia Finanzas', async () => {
  await q(`insert into comercial.parametros_costo (corte_a, corte_b) values (0.6, 0.9)`);
  const p = await q(`select producto_id, clase from comercial.pareto($1, $1)`, [mes]);
  // Previos: 0, 70, 85, 93, 97,5 → A, B, B, C, C.
  const esperado = ['A', 'B', 'B', 'C', 'C'];
  const clase = Object.fromEntries(p.map((r) => [r.producto_id, r.clase]));
  prods.forEach((id, i) => { if (clase[id] !== esperado[i]) throw new Error(JSON.stringify(p)); });
});

await prueba('alertas: precio por debajo del costo o del margen mínimo', async () => {
  // Precio de lista del primero por debajo del costo de la foto del mes en curso.
  await db.exec('reset role');
  const hoy = (await uno(`select date_trunc('month', comercial.hoy())::date::text m`)).m;
  await q(`insert into comercial.fotos_costo_producto (mes, producto_id, costo_unitario, faltantes, detalle) values ($1,$2,5000,0,'[]')
           on conflict (mes, producto_id) do update set costo_unitario = 5000`, [hoy, prods[0]]);
  await q(`insert into comercial.precios_producto (producto_id, precio_lista) values ($1, 4840)`, [prods[0]]); // neto 4.000
  await como('gaby@x');
  const a = await q(`select alerta, margen_pct from comercial.v_alertas_precio where producto_id=$1 and banda='CONSUMIDOR_FINAL'`, [prods[0]]);
  if (a.length !== 1 || a[0].alerta !== 'BAJO_COSTO' || !cerca(a[0].margen_pct, -0.25)) throw new Error(JSON.stringify(a));
});

await prueba('rotación: días de stock = saldo / consumo diario de los últimos 90 días', async () => {
  const r0 = await uno(`select insumo_id, saldo from comercial.v_rotacion_insumos where saldo > 0 and lotes_sin_costo = 0 limit 1`);
  if (!r0) throw new Error('sin insumos con saldo y costo');
  const C = Number(r0.saldo) / 2; // consumo de la mitad del saldo en 90 días
  await db.exec('reset role');
  await db.exec(`set session_replication_role = replica`); // sólo la cuenta de la vista; el circuito tiene sus pruebas
  const l = await uno(`select s.articulo_id, s.lote_insumo_id, s.deposito_id, s.unidad from comercial.v_saldos_stock s
                        join gmp.lotes_insumo l on l.id = s.lote_insumo_id where l.insumo_id=$1 and s.saldo > 0 limit 1`, [r0.insumo_id]);
  const i = await uno(`select unidad_medida from gmp.insumos_catalogo where id=$1`, [r0.insumo_id]);
  await q(`insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, unidad, registrado_por)
           values ($1,$2,$3,'SALIDA_CONSUMO_PRODUCCION',$4,$5,(select id from core.usuarios where email='gaby@x'))`,
          [l.articulo_id, l.lote_insumo_id, l.deposito_id, -C, i.unidad_medida]);
  // Un consumo de 300 anulado (ENTRADA_AJUSTE que apunta al original) no cuenta.
  const anulado = (await uno(`insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, unidad, registrado_por)
           values ($1,$2,$3,'SALIDA_CONSUMO_PRODUCCION',-300,$4,(select id from core.usuarios where email='gaby@x')) returning id`,
          [l.articulo_id, l.lote_insumo_id, l.deposito_id, i.unidad_medida])).id;
  await q(`insert into comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, unidad, registrado_por, anula_a_movimiento_id, motivo_tipo, motivo)
           values ($1,$2,$3,'ENTRADA_AJUSTE',300,$4,(select id from core.usuarios where email='gaby@x'),$5,'ERROR_DE_REGISTRO','Consumo cargado de más')`,
          [l.articulo_id, l.lote_insumo_id, l.deposito_id, i.unidad_medida, anulado]);
  await db.exec(`set session_replication_role = origin`);
  await como('gaby@x');
  const r = await uno(`select saldo, consumo_diario, dias_de_stock from comercial.v_rotacion_insumos where insumo_id=$1`, [r0.insumo_id]);
  if (!cerca(r.consumo_diario, C / 90, 1e-3) || !cerca(r.dias_de_stock, Math.round((N(r.saldo) / (C / 90)) * 10) / 10, 0.11)) throw new Error(JSON.stringify({ r, C }));
});

await prueba('Ventas no ve Pareto, rotación ni precios de proveedor', async () => {
  await como('mati@x');
  const p = await q(`select * from comercial.pareto($1, $1)`, [mes]);
  const r = await uno(`select count(*)::int n from comercial.v_rotacion_insumos`);
  const v = await uno(`select count(*)::int n from comercial.v_precios_proveedor`);
  if (p.length !== 0 || r.n !== 0 || v.n !== 0) throw new Error(JSON.stringify({ p: p.length, r, v }));
});

await invariantes();
fin();
