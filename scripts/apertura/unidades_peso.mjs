#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Unidad de la columna PESO de la planilla de apertura (D-42).
//
// xlsx_a_csv.py copia el VALOR de cada celda; la unidad («kg.», «gr.», «lts.»,
// «ml.», «Plancha») no es parte del valor, es el formato de número de la celda
// (#,##0 "kg."). Este script la lee del formato y escribe un CSV con el mismo
// orden de renglones que inventario_apertura.csv.
//
// Uso:  node scripts/apertura/unidades_peso.mjs "<ruta al .xlsx>"
// Salida: scripts/apertura/inventario_apertura_unidades.csv (codigo, peso_unidad)
// Verifica que el archivo sea el mismo que describe origen.json (SHA-256).
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { leerZip } from '../../src/lib/xlsx.ts';

const AQUI = new URL('./', import.meta.url);
const origen = JSON.parse(readFileSync(new URL('origen.json', AQUI), 'utf8'));
const ruta = process.argv[2];
if (!ruta) throw new Error('Falta la ruta al .xlsx de origen.');
const buf = readFileSync(ruta);
const hash = createHash('sha256').update(buf).digest('hex');
if (hash !== origen.hash_archivo)
  throw new Error(`El archivo no es el de origen.json (sha256 ${hash}).`);

const zip = await leerZip(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
);
const t = (n) => (zip.get(n) ? new TextDecoder().decode(zip.get(n)) : '');
const id = new RegExp(`<sheet\\b[^>]*name="${origen.hoja}"[^>]*r:id="([^"]+)"`).exec(
  t('xl/workbook.xml'),
)[1];
const rels = t('xl/_rels/workbook.xml.rels');
const destino =
  new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ??
  new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)[1];
const hoja = t(destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`);
const estilos = t('xl/styles.xml');
const formatos = new Map(
  [...estilos.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [
    m[1],
    m[2],
  ]),
);
const xfs = [
  .../<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)[1].matchAll(/<xf\b([^>]*)/g),
].map((m) => /numFmtId="(\d+)"/.exec(m[1])?.[1] ?? '0');
const compartidos = [...t('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
  (m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''),
);

// «#,##0 "kg."» → kg. Las que no son de masa ni volumen quedan con su nombre.
const UNIDADES = { kg: 'kg', gr: 'g', lts: 'l', ml: 'ml' };
const unidad = (formato) => {
  const u = /&quot;([^&]+)&quot;/
    .exec(formato ?? '')?.[1]
    ?.trim()
    .toLowerCase()
    .replace(/\.$/, '');
  return u ? (UNIDADES[u] ?? u) : '';
};

const filas = new Map();
for (const c of hoja.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const n = Number(c[2]);
  if (n < 3 || (c[1] !== 'A' && c[1] !== 'D')) continue;
  const f = filas.get(n) ?? {};
  if (c[1] === 'A') {
    let v =
      /<v>([\s\S]*?)<\/v>/.exec(c[4] ?? '')?.[1] ??
      /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[4] ?? '')?.[1] ??
      '';
    if (/\bt="s"/.test(c[3])) v = compartidos[Number(v)];
    f.codigo = v.trim();
  } else {
    const s = /\bs="(\d+)"/.exec(c[3])?.[1];
    f.unidad = s ? unidad(formatos.get(xfs[Number(s)])) : '';
  }
  filas.set(n, f);
}
const salida = [...filas]
  .sort((a, b) => a[0] - b[0])
  .map(([, f]) => f)
  .filter((f) => f.codigo);
if (salida.length !== origen.renglones)
  throw new Error(
    `Se leyeron ${salida.length} renglones, origen.json dice ${origen.renglones}.`,
  );
writeFileSync(
  new URL('inventario_apertura_unidades.csv', AQUI),
  ['codigo,peso_unidad', ...salida.map((f) => `${f.codigo},${f.unidad ?? ''}`)].join(
    '\n',
  ) + '\n',
);
console.log(`${salida.length} renglones → inventario_apertura_unidades.csv`);
