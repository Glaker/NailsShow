#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Costos de la planilla de apertura → migración que los deja como dice D-42.
//
// Cadena: 05 INVENTARIO NAIL SHOW FABRICA.xlsx → xlsx_a_csv.py →
// inventario_apertura.csv, más unidades_peso.mjs → inventario_apertura_unidades.csv
// (la unidad de PESO está en el formato de la celda, no en su valor) → este
// script → supabase/migrations/<ts>_rectifica_costos_apertura_d42.sql
//
// No escribe contra la base. Genera la migración; se aplica con db push.
//
// QUÉ SE LEE DE CADA RENGLÓN (D-42, resuelta por Finanzas el 2026-10-10):
//   - Importes netos de IVA.
//   - «Unitario» = precio de UNA presentación de compra. En pesos se toma el
//     «Unitario»; con «COSTO U$D», el monto en dólares de una presentación
//     (COSTO U$D / CANTIDAD; sin CANTIDAD, 1, como hace la planilla con el
//     «Unitario») y nunca COSTO $: sus tipos de cambio implícitos no son
//     coherentes. Se convierte en la base con el tipo de cambio activo.
//   - Tamaño de la presentación: PESO con su unidad (1 kg., 45 gr., 0,06 lts.).
//     La base decide con la unidad del catálogo: líquido o polvo (g, kg, ml, l)
//     sin cantidad y unidad claras queda PENDIENTE; en UNIDAD, el «Unitario» ya
//     es por unidad.
//   - FECHA ACT → fecha del costo (nula si falta o es imposible).
//   - Dólares cuyo tipo de cambio implícito contra el «Unitario» en pesos cae
//     fuera de 300..3000 $/U$D (pesos rotulados como dólares, columnas
//     corridas): no se cargan; quedan pendientes DOLAR_A_REVISAR para que
//     Finanzas confirme. Cargar a sabiendas un valor absurdo no es la regla.
// Código repetido: rige el renglón con fecha más reciente (sin fecha pierde).
//
// Uso: node scripts/apertura/generar_costos_apertura.mjs <AAAAMMDDhhmmss> [salida]
// ---------------------------------------------------------------------------
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const ts = process.argv[2];
if (!/^\d{14}$/.test(ts ?? '')) {
  console.error('Uso: node generar_costos_apertura.mjs <AAAAMMDDhhmmss> [salida]');
  process.exit(1);
}
const salida =
  process.argv[3] ??
  path.join(RAIZ, 'supabase', 'migrations', `${ts}_rectifica_costos_apertura_d42.sql`);
// Una migración escrita no se pisa (CLAUDE.md §6).
if (existsSync(salida)) {
  console.error(`${salida} ya existe: una migración escrita no se regenera encima.`);
  process.exit(1);
}

const origen = JSON.parse(readFileSync(path.join(AQUI, 'origen.json'), 'utf8'));
const leer = (f) =>
  readFileSync(path.join(AQUI, f), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim());

// El CSV lo produce xlsx_a_csv.py; los campos con coma vienen entre comillas.
const partir = (l) => {
  const out = [];
  let f = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"' && l[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(f);
      f = '';
    } else f += c;
  }
  out.push(f);
  return out;
};
const [cab, ...filas] = leer('inventario_apertura.csv');
const col = partir(cab);
const renglones = filas.map((l) =>
  Object.fromEntries(partir(l).map((v, i) => [col[i], v.trim()])),
);
const [, ...unidades] = leer('inventario_apertura_unidades.csv');
if (unidades.length !== renglones.length)
  throw new Error('El CSV de unidades no tiene los mismos renglones.');
unidades.forEach((l, i) => {
  const [codigo, unidad] = l.split(',');
  if (codigo !== renglones[i].codigo)
    throw new Error(`Renglón ${i + 1}: ${codigo} ≠ ${renglones[i].codigo}`);
  renglones[i].peso_unidad = unidad || null;
});

const num = (s) =>
  s === '' || s == null || !Number.isFinite(Number(s)) ? null : Number(s);
const HOY = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
const porCodigo = new Map();
const sinCosto = [];
const dolarRaro = [];
for (const r of renglones) {
  if (!r.codigo) continue;
  const usd = num(r.costo_usd);
  const unitario = num(r.costo_unitario_ars);
  const presentaciones = num(r.contenido_cantidad) > 0 ? num(r.contenido_cantidad) : 1;
  const moneda = usd > 0 ? 'USD' : 'ARS';
  const importe = usd > 0 ? usd / presentaciones : unitario;
  if (!(importe > 0)) {
    sinCosto.push(r.codigo);
    continue;
  }
  let revisar = false;
  if (usd > 0 && unitario > 0) {
    const tc = unitario / importe;
    revisar = tc < 300 || tc > 3000;
    if (revisar) dolarRaro.push(`${r.codigo} (${tc.toFixed(0)} $/U$D)`);
  }
  const fecha =
    /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_actualizacion_costo) &&
    r.fecha_actualizacion_costo <= HOY
      ? r.fecha_actualizacion_costo
      : null;
  const peso = num(r.contenido_peso);
  const cand = {
    codigo: r.codigo,
    moneda,
    importe: Number(importe.toFixed(4)),
    revisar,
    peso: peso > 0 ? peso : null,
    unidad: r.peso_unidad,
    fecha,
    peso_texto: [r.contenido_peso, r.peso_unidad].filter(Boolean).join(' ') || null,
    detalle: r.detalle || null,
  };
  const prev = porCodigo.get(r.codigo);
  if (!prev || (cand.fecha && (!prev.fecha || cand.fecha > prev.fecha)))
    porCodigo.set(r.codigo, cand);
}

const lit = (v) =>
  v === null || v === undefined
    ? 'null'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const valores = [...porCodigo.values()]
  .map(
    (c) =>
      `    (${lit(c.codigo)}, ${lit(c.moneda)}, ${lit(c.importe)}, ${lit(c.peso)}, ${lit(c.unidad)}, ` +
      `${c.fecha ? `date ${lit(c.fecha)}` : 'null'}, ${lit(c.peso_texto)}, ${lit(c.detalle)}, ${c.revisar})`,
  )
  .join(',\n');

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Dejar el costo de la planilla de apertura como lo definió
--             Finanzas (D-42, 2026-10-10). Rectifica lo que cargaron
--             20261009120400 y 20261009120410 con los supuestos anteriores
--             (unitario por kg o litro, tipo de cambio implícito), anula lo que
--             ya no tiene costo válido y deja los pendientes.
-- Reglas    : D-42, R-10. Ningún costo se edita: cada corrección es una fila
--             que rectifica a la vigente y dice por qué.
-- Fecha     : ${HOY}
-- ---------------------------------------------------------------------------
--
-- GENERADA por scripts/apertura/generar_costos_apertura.mjs. No editar a mano:
-- se corrige el script y se genera una migración nueva.
--
-- Origen: ${origen.archivo_origen} (hoja ${origen.hoja}), sha256 ${origen.hash_archivo}.
-- ${porCodigo.size} códigos con costo; ${sinCosto.length} renglones sin costo en la planilla.
--
-- QUÉ HACE, por cada lote del saldo de apertura de un código de la planilla:
--   - Líquido o polvo (catálogo en g, kg, ml o l) con PESO claro: costo =
--     «Unitario» (o U$D) de la presentación, por PESO en su unidad. Si la
--     unidad es de volumen y el catálogo de masa (o al revés), la base lo
--     convierte con la densidad; sin densidad, el insumo queda pendiente solo.
--   - Líquido o polvo sin PESO claro: se anula el costo anterior y el insumo
--     va a comercial.costos_apertura_pendientes (FALTA_CANTIDAD).
--   - Dólares incoherentes con el «Unitario» en pesos: igual, DOLAR_A_REVISAR.
--   - En UNIDAD: el «Unitario» por unidad.
--   - En dólares: monto en U$D sin tipo de cambio propio; lo convierte la
--     vista con el activo de la serie (v_tipo_cambio_activo).
--   - Si el costo vigente ya es ése, no se toca (no se llena la auditoría).
--   - Sólo se rectifica lo que salió de la planilla (20261009120400, 120410 o
--     esta misma): un costo de apertura que cargó Finanzas a mano no se toca,
--     ni se anula el de un código que la planilla no trae.
${dolarRaro.length ? `--\n-- DÓLARES A REVISAR (D-42): tipo de cambio implícito fuera de 300..3000 $/U$D\n-- en la planilla. Quedan pendientes, sin costo:\n${dolarRaro.map((d) => `--   ${d}`).join('\n')}\n` : ''}--
-- AUTOR y ANOMALÍA ESPERADA: como en 20261009120400 (quien asentó el saldo de
-- apertura; db_role = postgres en core.escrituras_privilegiadas).

do $$
declare
  v_autor uuid;
  v_n     integer;
begin
  select ejecutada_por into v_autor from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_autor is null then
    raise notice 'No hay saldo de apertura asentado: no hay lotes donde cargar costos.';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('usuario_id', v_autor::text)::text, true);

  drop table if exists planilla_d42, costo_d42, vigente_d42;
  create temp table planilla_d42 (
    codigo text, moneda text, importe numeric, peso numeric, peso_unidad text, fecha date,
    peso_texto text, detalle text, revisar boolean
  ) on commit drop;
  insert into planilla_d42 values
${valores};

  -- Clasificación con la unidad del catálogo.
  create temp table costo_d42 on commit drop as
  select p.*, i.id as insumo_id,
         case when p.revisar then 'DOLAR_A_REVISAR'
              when lower(i.unidad_medida) in ('g', 'kg', 'ml', 'l')
                then case when p.peso > 0 and p.peso_unidad in ('g', 'kg', 'ml', 'l') then 'OK' else 'FALTA_CANTIDAD' end
              when lower(i.unidad_medida) = 'unidad' then 'OK'
              else 'SIN_UNIDAD' end as estado,
         case when lower(i.unidad_medida) = 'unidad' then 1 else p.peso end as cantidad,
         case when lower(i.unidad_medida) = 'unidad' then 'UNIDAD' else p.peso_unidad end as unidad,
         case when p.moneda = 'ARS' then 1 end as tipo_cambio
    from planilla_d42 p
    join gmp.insumos_catalogo i on i.codigo_interno = p.codigo;

  -- Costo vigente de apertura de cada lote de un código de la planilla (el que
  -- nadie rectificó). de_planilla: lo cargó la carga de apertura (autor y motivo
  -- de 120400, 120410 o esta migración), no Finanzas a mano.
  create temp table vigente_d42 on commit drop as
  select l.id as lote_insumo_id, l.insumo_id, c.id, c.importe, c.moneda, c.tipo_cambio, c.cantidad, c.unidad,
         c.fecha_costo,
         c.id is not null and c.cargado_por = v_autor
           and (c.motivo like 'Planilla de apertura%' or c.motivo like 'La planilla%' or c.motivo like 'D-42%')
           as de_planilla
    from gmp.lotes_insumo l
    left join comercial.costos_lote c
      on c.lote_insumo_id = l.id and c.origen = 'APERTURA'
     and not exists (select 1 from comercial.costos_lote r where r.rectifica_a = c.id)
   where l.migracion_apertura_id is not null
     and l.insumo_id in (select insumo_id from costo_d42);

  -- 1. Costos que valen: carga nueva o rectificación de la vigente.
  insert into comercial.costos_lote
    (lote_insumo_id, origen, importe, moneda, tipo_cambio, cantidad, unidad, fecha_costo, rectifica_a, motivo, cargado_por)
  select v.lote_insumo_id, 'APERTURA', n.importe, n.moneda, n.tipo_cambio, n.cantidad, n.unidad, n.fecha, v.id,
         case when v.id is null then 'Planilla de apertura (D-42)'
              else 'D-42: el «Unitario» es el precio de la presentación (no por kg ni litro) y los dólares se '
                   'convierten con la serie A3500, no con el tipo de cambio implícito de la planilla.' end,
         v_autor
    from costo_d42 n
    join vigente_d42 v on v.insumo_id = n.insumo_id
   where n.estado = 'OK'
     and (v.id is null or v.de_planilla)
     and (v.id is null
          or (v.importe, v.moneda, v.tipo_cambio, v.cantidad, lower(v.unidad), v.fecha_costo)
             is distinct from (n.importe, n.moneda, n.tipo_cambio, n.cantidad, lower(n.unidad), n.fecha));
  get diagnostics v_n = row_count;
  raise notice 'Costos de apertura cargados o rectificados: %', v_n;

  -- 2. Costos que ya no valen: se anulan (fila sin importe que rectifica).
  insert into comercial.costos_lote
    (lote_insumo_id, origen, importe, moneda, tipo_cambio, cantidad, unidad, fecha_costo, rectifica_a, motivo, cargado_por)
  select v.lote_insumo_id, 'APERTURA', null, v.moneda, v.tipo_cambio, v.cantidad, v.unidad, v.fecha_costo, v.id,
         case (select n.estado from costo_d42 n where n.insumo_id = v.insumo_id)
           when 'FALTA_CANTIDAD'
             then 'D-42: falta la cantidad de la presentación en la planilla; el costo anterior suponía kg o litro.'
           when 'DOLAR_A_REVISAR'
             then 'D-42: el monto en dólares de la planilla no es coherente con su unitario en pesos; queda a revisar.'
           else 'D-42: el código no tiene un costo utilizable en la planilla.' end,
         v_autor
    from vigente_d42 v
   where v.de_planilla and v.importe is not null
     and not exists (select 1 from costo_d42 n where n.insumo_id = v.insumo_id and n.estado = 'OK');
  get diagnostics v_n = row_count;
  raise notice 'Costos de apertura anulados: %', v_n;

  -- 3. Pendientes: sin cantidad de la presentación o con dólares a revisar.
  insert into comercial.costos_apertura_pendientes
    (insumo_id, importe, moneda, motivo, fecha_costo, peso_planilla, detalle, cargado_por)
  select n.insumo_id, n.importe, n.moneda, n.estado, n.fecha, n.peso_texto, n.detalle, v_autor
    from costo_d42 n
   where n.estado in ('FALTA_CANTIDAD', 'DOLAR_A_REVISAR')
  on conflict (insumo_id) do nothing;
  get diagnostics v_n = row_count;
  raise notice 'Insumos pendientes (falta cantidad o dólares a revisar): %', v_n;

  raise notice 'Códigos de la planilla sin unidad en el catálogo: %',
    (select string_agg(codigo, ', ' order by codigo) from costo_d42 where estado = 'SIN_UNIDAD');
  raise notice 'Códigos con costo que no tienen lote de apertura (su costo no tiene dónde ir): %',
    (select string_agg(n.codigo, ', ' order by n.codigo) from costo_d42 n
      where n.estado = 'OK' and not exists (select 1 from vigente_d42 v where v.insumo_id = n.insumo_id));
end;
$$;
`;

writeFileSync(salida, sql, 'utf8');
console.log(
  `${salida}\n${porCodigo.size} códigos con costo, ${sinCosto.length} renglones sin costo.`,
);
if (dolarRaro.length)
  console.log(`Dólares a revisar, quedan pendientes: ${dolarRaro.join(', ')}`);
