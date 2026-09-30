#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la carga inicial de precios de lista desde la hoja «UTILIDAD» de la
// planilla de inventario (ítem 7 de la cola del 2026-09-24).
//
// Columna A: código del producto. Columna C: descripción. Columna D:
// «PRECIO LISTA» (consumidor final, IVA incluido). Se cargan solo los códigos
// que están en gmp.productos; el resto va a pendientes.md con su motivo.
// Un código repetido con precios distintos no se carga: no hay forma de saber
// cuál rige sin preguntar.
//
// Sin dependencias (CLAUDE.md §7): el xlsx se descomprime aparte.
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//   Linux/mac:   unzip planilla.xlsx -d dir
//
// Uso:
//   node scripts/precios/generar_migracion.mjs <planilla.xlsx> <dir_descomprimido> [carpeta_salida]
//
// codigos_catalogo.txt: los códigos de gmp.productos (sin tercerizados) al
// generar; la carga igual cruza por código en la base, así que un código que
// falte ahí solo termina en pendientes.
//
// Salida (no pisa archivos existentes: una migración escrita no se edita):
//   supabase/migrations/20260929150100_carga_precios.sql
//   scripts/precios/pendientes.md
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
// El tercer argumento opcional es la carpeta de salida de la migración (para
// probarla antes de escribirla en supabase/migrations).
const [xlsx, dir, salida = path.join(RAIZ, 'supabase/migrations')] = process.argv.slice(2);
if (!xlsx || !dir) {
  console.error('Uso: generar_migracion.mjs <planilla.xlsx> <dir_descomprimido>');
  process.exit(1);
}

const HOJA = 'UTILIDAD';
const dec = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const wb = readFileSync(`${dir}/xl/workbook.xml`, 'utf8');
const rels = readFileSync(`${dir}/xl/_rels/workbook.xml.rels`, 'utf8');
const shared = [...readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
  (m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);
const rid = new RegExp(`<sheet name="${HOJA}"[^>]*r:id="(rId\\d+)"`).exec(wb)[1];
const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)[1].replace(/^\/?xl\//, '');
const xml = readFileSync(`${dir}/xl/${target}`, 'utf8');

const filas = [];
for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const celdas = {};
  for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = /t="(\w+)"/.exec(c[2])?.[1];
    let v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? '')?.[1] ?? '';
    if (t === 's') v = shared[Number(v)];
    else if (t === 'inlineStr') v = dec(/<t[^>]*>([\s\S]*?)<\/t>/.exec(c[3] ?? '')?.[1] ?? '');
    celdas[c[1]] = dec(String(v));
  }
  filas.push({ fila: Number(r[1]), ...celdas });
}

const catalogo = new Set(
  readFileSync(`${AQUI}/codigos_catalogo.txt`, 'utf8')
    .split('\n')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
);

const porCodigo = new Map();
const pendientes = [];
for (const f of filas.filter((x) => x.fila >= 3)) {
  const cod = (f.A ?? '').trim();
  if (!cod) continue;
  const precio = Math.round(Number(f.D) * 100) / 100;
  const nombre = (f.C ?? '').trim();
  if (!catalogo.has(cod.toUpperCase())) {
    pendientes.push({ cod, nombre, fila: f.fila, motivo: 'el código no está en el catálogo de productos' });
    continue;
  }
  if (!(precio > 0)) {
    pendientes.push({ cod, nombre, fila: f.fila, motivo: 'sin precio de lista en la planilla' });
    continue;
  }
  const lista = porCodigo.get(cod.toUpperCase()) ?? [];
  lista.push({ cod, nombre, fila: f.fila, precio });
  porCodigo.set(cod.toUpperCase(), lista);
}

const cargar = [];
for (const [, lista] of porCodigo) {
  const precios = new Set(lista.map((x) => x.precio));
  if (precios.size > 1) {
    for (const x of lista)
      pendientes.push({
        ...x,
        motivo: `código repetido con precios distintos (${[...precios].join(' / ')}): falta saber cuál rige`,
      });
    continue;
  }
  cargar.push(lista[0]);
}

const sha = createHash('sha256').update(readFileSync(xlsx)).digest('hex');
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const valores = cargar
  .map((x) => `  (${q(x.cod)}, ${x.precio.toFixed(2)}, ${q(`Planilla, hoja ${HOJA}, fila ${x.fila}`)})`)
  .join(',\n');

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Carga inicial de precios de lista (IVA incluido) desde la hoja
--             «${HOJA}» de la planilla de inventario: ${cargar.length} productos.
-- Reglas    : §4.12.1 (precios versionados). Ítem 7 de la cola del 2026-09-24.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/precios/generar_migracion.mjs. No editar a mano.
--
-- Archivo de origen: ${path.basename(xlsx)}, hoja «${HOJA}», columna D («PRECIO LISTA»)
-- sha256: ${sha}
-- ${pendientes.length} renglones de la hoja quedaron afuera: scripts/precios/pendientes.md.
--
-- A nombre de la Dirección Técnica activa (la titular si existe, si no la
-- suplente), igual que la carga de saldo de apertura: es quien pidió la carga.
-- Desde acá, cada cambio lo hace Ventas y queda a su nombre.

insert into comercial.precios_producto (producto_id, precio_lista, alicuota_iva, origen, motivo, cargado_por)
select p.id, v.precio, 21, v.origen, 'Carga inicial desde la planilla de inventario',
       (select id from core.usuarios
         where rol = 'DIRECCION_TECNICA' and activo
         order by es_dt_titular desc, creado_en
         limit 1)
  from (values
${valores}
  ) as v(codigo, precio, origen)
  join gmp.productos p on upper(btrim(p.codigo_interno)) = upper(v.codigo) and p.tercero_id is null;
`;

const md = `# Precios que no entraron en la carga inicial

Generado por \`scripts/precios/generar_migracion.mjs\` desde la hoja «${HOJA}»
(sha256 \`${sha.slice(0, 16)}…\`). Se cargan a mano desde la pantalla de precios,
una vez resuelto el motivo.

| Fila | Código | Descripción | Motivo |
| ---: | --- | --- | --- |
${pendientes
  .sort((a, b) => a.fila - b.fila)
  .map((p) => `| ${p.fila} | ${p.cod} | ${p.nombre.replace(/\|/g, '/')} | ${p.motivo} |`)
  .join('\n')}
`;

writeFileSync(path.join(salida, '20260929150100_carga_precios.sql'), sql, { flag: 'wx' });
writeFileSync(path.join(AQUI, 'pendientes.md'), md);
console.log(`cargados ${cargar.length}, pendientes ${pendientes.length}`);
