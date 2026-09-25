#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la carga de la planilla de stock de seguridad y punto de pedido por
// SKU (hoja «sku_stock») a comercial.stock_seguridad_sku.
//
// Sin dependencias (CLAUDE.md §7): el xlsx se descomprime aparte.
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//   Linux/mac:   unzip planilla.xlsx -d dir
//
// Uso:
//   node scripts/stock_seguridad/generar_migracion.mjs <planilla.xlsx> <dir_descomprimido>
//
// Salida:
//   supabase/migrations/20260925100100_carga_stock_seguridad.sql
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const [xlsx, dir] = process.argv.slice(2);
if (!xlsx || !dir) {
  console.error('Uso: generar_migracion.mjs <planilla.xlsx> <dir_descomprimido>');
  process.exit(1);
}

const dec = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const wb = readFileSync(`${dir}/xl/workbook.xml`, 'utf8');
const rels = readFileSync(`${dir}/xl/_rels/workbook.xml.rels`, 'utf8');
const shared = [
  ...readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g),
].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));

function hoja(nombre) {
  const rid = new RegExp(`<sheet name="${nombre}"[^>]*r:id="(rId\\d+)"`).exec(wb)?.[1];
  const destino = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  if (!destino) throw new Error(`No encontré la hoja ${nombre}`);
  const xml = readFileSync(`${dir}/xl/${destino.replace(/^\/?xl\//, '')}`, 'utf8');
  const filas = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, fila, attrs, cuerpo = ''] = m;
    const t = /t="(\w+)"/.exec(attrs)?.[1];
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    let valor = v ?? /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cuerpo)?.[1];
    if (valor === undefined) continue;
    valor = t === 's' ? shared[Number(v)] : dec(valor);
    (filas[fila] ??= {})[col] = valor;
  }
  return filas;
}

const H = hoja('sku_stock');
const encabezado = H[1];
const filas = Object.entries(H)
  .filter(([f]) => Number(f) > 1)
  .map(([, r]) => Object.fromEntries(Object.entries(encabezado).map(([c, n]) => [n, r[c]])));
if (filas.length !== 603) throw new Error(`Se esperaban 603 SKU y hay ${filas.length}`);

const sql = (s) =>
  s === undefined || s === null || String(s).trim() === ''
    ? 'null'
    : `'${String(s).trim().replace(/'/g, "''")}'`;
const num = (s, dec = 4) => {
  const n = Number(s);
  if (!Number.isFinite(n)) return 'null';
  return String(Math.round(n * 10 ** dec) / 10 ** dec);
};
const bool = (s) => (String(s) === '1' ? 'true' : 'false');

const sha = createHash('sha256').update(readFileSync(xlsx)).digest('hex');
const valores = filas.map(
  (r) =>
    `  (${sql(r.sku_cod)}, ${sql(r.descripcion)}, ${sql(r.estado)}, ${sql(r.origen)}, ${bool(r.aplica_stock)}, ` +
    `${bool(r.incluye_produccion)}, ${sql(r.clase_demanda)}, ${num(r.mu_mensual)}, ${num(r.sigma_mensual)}, ` +
    `${num(r.lt_total_media_dh)}, ${num(r.demanda_lt_media)}, ${num(r.ss_unidades, 0)}, ${num(r.rop_unidades, 0)}, ` +
    `${num(r.cobertura_ss_dh)})`,
);

const salida = `-- ---------------------------------------------------------------------------
-- Propósito : Cargar la planilla de stock de seguridad y punto de pedido por
--             SKU (603 SKU) como referencia, y vincular cada SKU con su
--             producto del catálogo por código.
-- Reglas    : Pedido del codirector técnico (2026-09-24, ítem 4 de la cola).
--             La meta que rige la edita Gerencia de Producción
--             (comercial.metas_stock_seguridad); esto es la referencia.
-- Fecha     : 2026-09-25
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/stock_seguridad/generar_migracion.mjs. No editar a
-- mano: regenerar desde la planilla.
--
-- Archivo de origen: Stock_Seguridad_ROP_NailShow(1).xlsx, hoja «sku_stock»
-- sha256: ${sha}
-- Supuestos de la planilla (hoja «parametros»): nivel de servicio 95 %,
-- factor de calibración 1, 20,5 días hábiles por mes, lead time de materia
-- prima 7 ± 2 y de producción 5 ± 2 días hábiles.

insert into comercial.stock_seguridad_sku (
  sku_cod, descripcion, estado_demanda, origen, aplica_stock, incluye_produccion,
  clase_demanda, mu_mensual, sigma_mensual, lead_time_dh, demanda_lead_time,
  ss_planilla, rop_planilla, cobertura_ss_dh
) values
${valores.join(',\n')};

-- Vínculo con el catálogo por código, sin distinguir mayúsculas ni espacios.
-- Los SKU sin producto quedan sin vincular: se dan de alta desde la pantalla.
update comercial.stock_seguridad_sku s
   set producto_id = p.id
  from gmp.productos p
 where p.tercero_id is null
   and upper(btrim(p.codigo_interno)) = upper(btrim(s.sku_cod));

do $$
declare v_n integer; v_v integer;
begin
  select count(*), count(producto_id) into v_n, v_v from comercial.stock_seguridad_sku;
  if v_n <> ${filas.length} then
    raise exception 'Se esperaban ${filas.length} SKU y quedaron %.', v_n;
  end if;
  raise notice 'SKU cargados: %, vinculados con producto: %', v_n, v_v;
end;
$$;
`;

writeFileSync(`${RAIZ}/supabase/migrations/20260925100100_carga_stock_seguridad.sql`, salida);
console.log(`SKU ${filas.length}`);
