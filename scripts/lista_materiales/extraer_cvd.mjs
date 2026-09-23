#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Extrae de la hoja «C.V.D.» de la planilla de inventario los bloques de lista
// de materiales marcados en celeste, y solo esos.
//
// Por qué solo celeste: la Gerencia indicó (2026-09-23) que los bloques
// celestes son los vigentes y los que están referenciados al stock. El resto
// de la hoja (amarillo, naranja, verde) son versiones anteriores, costeos o
// propuestas, y leerlos mezclaría recetas que ya no rigen.
//
// Sin dependencias (CLAUDE.md §7): un xlsx es un zip de XML. Este script lee
// el zip ya descomprimido; descomprimirlo es un paso aparte:
//
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//   Linux/mac:   unzip planilla.xlsx -d dir
//
// Uso:
//   node scripts/lista_materiales/extraer_cvd.mjs <planilla.xlsx> <dir_descomprimido>
//
// Salida:
//   scripts/lista_materiales/cvd_celeste.csv   un renglón por insumo de bloque
//   scripts/lista_materiales/origen.json       sha256 del xlsx y hoja leída
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [xlsx, dir] = process.argv.slice(2);
if (!xlsx || !dir) {
  console.error('Uso: extraer_cvd.mjs <planilla.xlsx> <dir_descomprimido>');
  process.exit(1);
}

const HOJA = 'C.V.D.';
// Relleno «celeste» estándar de Excel. Es el único que la hoja usa con ese
// sentido; el azul pálido de tema (theme 8) marca un bloque de colecciones
// que no es celeste y queda afuera.
const CELESTE = 'rgb="FF00B0F0"';

const dec = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// ---- Hoja → archivo -------------------------------------------------------
const wb = readFileSync(`${dir}/xl/workbook.xml`, 'utf8');
const rels = readFileSync(`${dir}/xl/_rels/workbook.xml.rels`, 'utf8');
const rid = new RegExp(
  `<sheet name="${HOJA.replace(/\./g, '\\.')}"[^>]*r:id="(rId\\d+)"`,
).exec(wb)?.[1];
const destino = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
if (!destino) throw new Error(`No encontré la hoja ${HOJA}`);

// ---- Textos compartidos y estilos ------------------------------------------
const shared = [
  ...readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8').matchAll(
    /<si>([\s\S]*?)<\/si>/g,
  ),
].map((m) =>
  dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);
const st = readFileSync(`${dir}/xl/styles.xml`, 'utf8');
const fills = [
  .../<fills[^>]*>([\s\S]*?)<\/fills>/
    .exec(st)[1]
    .matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\/>/g),
].map((m) => {
  const x = m[1] ?? '';
  const fg = /<fgColor ([^/]*)\/>/.exec(x);
  const pat = /patternType="(\w+)"/.exec(x);
  return pat && pat[1] !== 'none' && fg ? fg[1].trim() : null;
});
const xfs = [
  .../<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)[1].matchAll(/<xf ([^>]*?)\/?>/g),
].map((m) => {
  const f = /fillId="(\d+)"/.exec(m[1]);
  return f ? fills[Number(f[1])] : null;
});

// ---- Celdas ----------------------------------------------------------------
const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const grid = new Map();
const sh = readFileSync(`${dir}/xl/${destino}`, 'utf8');
for (const m of sh.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const [, col, fila, attrs, cuerpo = ''] = m;
  const t = /t="(\w+)"/.exec(attrs)?.[1];
  const s = /s="(\d+)"/.exec(attrs)?.[1];
  const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
  let valor =
    v === undefined ? (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(cuerpo)?.[1] ?? '') : v;
  valor = t === 's' ? shared[Number(v)] : dec(valor);
  grid.set(`${colNum(col)}:${fila}`, {
    col,
    fila: Number(fila),
    valor: String(valor ?? '').trim(),
    celeste: (s ? xfs[Number(s)] : null) === CELESTE,
  });
}
const at = (c, f) => grid.get(`${c}:${f}`);

// ---- Bloques ---------------------------------------------------------------
// Un bloque empieza en una fila de encabezado con «CANT. UNIT.» en celeste. A
// la izquierda de esa celda están el nombre y el código del producto; debajo,
// un insumo por fila hasta «TOTAL».
const filas = [];
for (const c of grid.values()) {
  if (!c.celeste || c.valor.toUpperCase() !== 'CANT. UNIT.') continue;
  const q = colNum(c.col);
  const izq = [];
  for (let k = q - 1; k >= 1 && izq.length < 2; k--) {
    const v = at(k, c.fila);
    if (v?.valor) izq.push(k);
  }
  const nombreCol = izq[0];
  const codigoCol = izq[1] && nombreCol - izq[1] <= 2 ? izq[1] : nombreCol - 1;
  const bloque = `${c.col}${c.fila}`;
  for (let f = c.fila + 1; f < c.fila + 30; f++) {
    const nom = at(nombreCol, f);
    const cod = at(codigoCol, f);
    const cant = at(q, f);
    if (/^TOTAL$/i.test(nom?.valor ?? '')) break;
    if (!nom?.valor && !cod?.valor && !cant?.valor) break;
    if (![nom, cod, cant].some((x) => x?.celeste)) break;
    filas.push({
      bloque,
      producto_planilla: at(codigoCol, c.fila)?.valor ?? '',
      producto_nombre_planilla: at(nombreCol, c.fila)?.valor ?? '',
      fila: f,
      insumo_codigo: cod?.valor ?? '',
      insumo_nombre_planilla: nom?.valor ?? '',
      cantidad: cant?.valor ?? '',
    });
  }
}
filas.sort(
  (a, b) =>
    a.fila - b.fila ||
    colNum(a.bloque.replace(/\d+/g, '')) - colNum(b.bloque.replace(/\d+/g, '')),
);

const csv = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const cab = Object.keys(filas[0]);
writeFileSync(
  path.join(AQUI, 'cvd_celeste.csv'),
  [cab.join(','), ...filas.map((r) => cab.map((k) => csv(r[k])).join(','))].join('\n') +
    '\n',
);
writeFileSync(
  path.join(AQUI, 'origen.json'),
  JSON.stringify(
    {
      archivo_origen: path.basename(xlsx),
      hoja: HOJA,
      criterio: 'solo celdas con relleno celeste (FF00B0F0)',
      sha256_xlsx: createHash('sha256').update(readFileSync(xlsx)).digest('hex'),
      renglones: filas.length,
      bloques: new Set(filas.map((r) => r.bloque)).size,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${filas.length} renglones en ${new Set(filas.map((r) => r.bloque)).size} bloques.`,
);
