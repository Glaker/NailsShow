#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Costos de la planilla de apertura → migración de comercial.costos_lote.
//
// Misma fuente y misma cadena que el saldo de apertura (generar_migracion.mjs):
//   05 INVENTARIO NAIL SHOW FABRICA.xlsx → xlsx_a_csv.py → inventario_apertura.csv
//   → este script → supabase/migrations/<ts>_carga_costos_apertura.sql
//
// No escribe contra la base. Genera la migración; se aplica con db push.
//
// QUÉ SE LEE DE CADA RENGLÓN (D-42, a confirmar):
//   - costo_unitario_ars: costo NETO por unidad de comercialización. Para los
//     insumos que el catálogo mide en g o kg (materias primas) se toma como
//     precio por KILOGRAMO; en ml, por LITRO; en UNIDAD, por unidad.
//   - costo_usd presente → moneda original USD, con tipo de cambio implícito
//     costo_ars / costo_usd. Si no, ARS.
//   - fecha_actualizacion_costo → fecha del costo (nula si la planilla no la tiene).
// Un código repetido en la planilla se consolidó en un solo lote de apertura;
// acá rige el renglón con fecha de costo más reciente (sin fecha, el primero).
//
// Uso: node scripts/apertura/generar_costos_apertura.mjs <timestamp>
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const ts = process.argv[2];
if (!/^\d{14}$/.test(ts ?? '')) {
  console.error('Uso: node generar_costos_apertura.mjs <AAAAMMDDhhmmss>');
  process.exit(1);
}
const salida = process.argv[3] ?? path.join(RAIZ, 'supabase', 'migrations', `${ts}_carga_costos_apertura.sql`);

const origen = JSON.parse(readFileSync(path.join(AQUI, 'origen.json'), 'utf8'));
const [cab, ...filas] = readFileSync(path.join(AQUI, 'inventario_apertura.csv'), 'utf8')
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
      if (c === '"' && l[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(f); f = ''; }
    else f += c;
  }
  out.push(f);
  return out;
};
const col = partir(cab);
const renglones = filas.map((l) => Object.fromEntries(partir(l).map((v, i) => [col[i], v.trim()])));

const num = (s) => (s === '' || s == null ? null : Number(s));
const porCodigo = new Map();
const sinCosto = [];
const dolarRaro = [];
const HOY = new Date().toISOString().slice(0, 10);
for (const r of renglones) {
  if (!r.codigo) continue;
  const unitario = num(r.costo_unitario_ars);
  if (!(unitario > 0)) { sinCosto.push(r.codigo); continue; }
  const ars = num(r.costo_ars);
  const usd = num(r.costo_usd);
  // Fecha imposible (la planilla trae 4835-02-07) o futura: sin fecha.
  const fecha =
    /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_actualizacion_costo) && r.fecha_actualizacion_costo <= HOY
      ? r.fecha_actualizacion_costo
      : null;
  // Dólar implícito fuera de lo razonable (0,66 o 5.535 $/U$D): el renglón
  // mezcla unidades entre columnas; se carga en pesos, que es lo seguro.
  const tcImplicito = usd > 0 && ars > 0 ? ars / usd : null;
  const usaUsd = tcImplicito !== null && tcImplicito >= 50 && tcImplicito <= 3000;
  if (tcImplicito !== null && !usaUsd) dolarRaro.push(`${r.codigo} (${tcImplicito.toFixed(2)})`);
  const tc = usaUsd ? tcImplicito : 1;
  const cand = {
    codigo: r.codigo,
    moneda: usaUsd ? 'USD' : 'ARS',
    tc: Number(tc.toFixed(6)),
    importe: Number((unitario / tc).toFixed(4)),
    fecha,
  };
  const prev = porCodigo.get(r.codigo);
  if (!prev || (cand.fecha && (!prev.fecha || cand.fecha > prev.fecha))) porCodigo.set(r.codigo, cand);
}

const lit = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const valores = [...porCodigo.values()]
  .map((c) => `    (${lit(c.codigo)}, ${lit(c.importe)}, ${lit(c.moneda)}, ${lit(c.tc)}, ${c.fecha ? `date ${lit(c.fecha)}` : 'null::date'})`)
  .join(',\n');

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Costo de la planilla de apertura sobre cada lote del saldo de
--             apertura (comercial.costos_lote, origen APERTURA). Es el tercer
--             escalón del costo de referencia (manual → último lote → apertura).
-- Reglas    : R-10 (identificación específica), D-42 (cómo se lee la planilla).
-- Fecha     : ${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}
-- ---------------------------------------------------------------------------
--
-- GENERADA por scripts/apertura/generar_costos_apertura.mjs. No editar a mano:
-- se corrige el script y se genera una migración nueva.
--
-- Origen: ${origen.archivo_origen} (hoja ${origen.hoja}), sha256 ${origen.hash_archivo}.
-- ${porCodigo.size} códigos con costo; ${sinCosto.length} renglones sin costo unitario en la planilla.
-- Sólo entran los códigos que tienen lote de apertura; los demás no están en
-- el catálogo (scripts/apertura/pendientes.md) y no tienen dónde ir.
--
-- SUPUESTOS (D-42): costo neto de IVA; el unitario es por kg en los insumos
-- que el catálogo mide en g o kg, por litro en los que mide en ml, y por unidad
-- en los que mide en UNIDAD; con costo en dólares, moneda original USD y tipo
-- de cambio implícito de la planilla (costo $ / costo U$D).
--
-- AUTOR: quien asentó el saldo de apertura (gmp.migracion_apertura), como en
-- 20260922200000. Se fija sólo el usuario en el claim, acotado a esta
-- transacción, para que la auditoría registre ese autor y no uno vacío.
--
-- ANOMALÍA ESPERADA: corre por db push, así que cada fila queda en
-- core.escrituras_privilegiadas con db_role = postgres. Es la carga de apertura
-- versionada, no una escritura fuera de circuito.

do $$
declare
  v_autor uuid;
  v_n     integer;
begin
  if exists (select 1 from comercial.costos_lote where origen = 'APERTURA') then
    raise exception 'Ya hay costos de apertura cargados. Se corrigen rectificando, no con otra carga.'
      using errcode = 'check_violation';
  end if;
  select ejecutada_por into v_autor from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_autor is null then
    raise notice 'No hay saldo de apertura asentado: no hay lotes donde cargar costos.';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('usuario_id', v_autor::text)::text, true);

  insert into comercial.costos_lote
    (lote_insumo_id, origen, importe, moneda, tipo_cambio, cantidad, unidad, fecha_costo, motivo, cargado_por)
  select l.id, 'APERTURA', v.importe, v.moneda, v.tc, 1,
         case lower(i.unidad_medida) when 'g' then 'kg' when 'kg' then 'kg' when 'ml' then 'l' else 'UNIDAD' end,
         v.fecha, 'Planilla de apertura', v_autor
    from (values
${valores}
    ) v(codigo, importe, moneda, tc, fecha)
    join gmp.insumos_catalogo i on i.codigo_interno = v.codigo
    join gmp.lotes_insumo l on l.insumo_id = i.id and l.migracion_apertura_id is not null
   where lower(i.unidad_medida) in ('g', 'kg', 'ml', 'unidad');
  get diagnostics v_n = row_count;
  raise notice 'Costos de apertura cargados: %', v_n;
  -- Lo que no entró, con el motivo, para que no se pierda en silencio.
  raise notice 'Códigos con costo en la planilla que no entraron (sin lote de apertura o sin unidad en el catálogo): %',
    (select string_agg(v.codigo, ', ' order by v.codigo)
       from (values
${valores.replace(/^ {4}/gm, '         ')}
       ) v(codigo, importe, moneda, tc, fecha)
      where not exists (
        select 1 from gmp.insumos_catalogo i
          join gmp.lotes_insumo l on l.insumo_id = i.id and l.migracion_apertura_id is not null
         where i.codigo_interno = v.codigo and lower(i.unidad_medida) in ('g', 'kg', 'ml', 'unidad')));
end;
$$;
`;

writeFileSync(salida, sql, 'utf8');
console.log(`${salida}\n${porCodigo.size} códigos con costo, ${sinCosto.length} sin costo.`);
if (dolarRaro.length) console.log(`Dólar implícito fuera de 50..3000, cargados en pesos: ${dolarRaro.join(', ')}`);
