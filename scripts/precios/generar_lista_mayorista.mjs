#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la carga de la lista mayorista desde la planilla «46.14 NAIL SHOW
// JUNIO 2026 MAYORISTAS» (hoja «LISTA 46.13», pedido del 2026-10-01).
//
// Columnas: B mínimo o unidades del pack, C código, D producto, E precio de
// lista, G precio con promoción (por unidad, IVA incluido; «DE REGALO» = 0).
// Si la fórmula del total de la fila (H) multiplica por B, el código se vende
// por pack de B unidades; si no, B es el mínimo sugerido. Las filas sin
// precio son el rubro de las que siguen. «NO STOCK» (columna A) no se carga:
// el stock lo dice el sistema.
//
// Sin dependencias (CLAUDE.md §7): el xlsx se descomprime aparte.
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//   Linux/mac:   unzip planilla.xlsx -d dir
//
// Uso:
//   node scripts/precios/generar_lista_mayorista.mjs <planilla.xlsx> <dir_descomprimido> [carpeta_salida]
//
// Salida (no pisa archivos existentes: una migración escrita no se edita):
//   supabase/migrations/20261001140000_carga_lista_mayorista.sql
//   scripts/precios/pendientes_mayorista.md
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const [xlsx, dir, salida = path.join(RAIZ, 'supabase/migrations')] = process.argv.slice(2);
if (!xlsx || !dir) {
  console.error('Uso: generar_lista_mayorista.mjs <planilla.xlsx> <dir_descomprimido>');
  process.exit(1);
}

const NUMERO_LISTA = '46.14';
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
// La primera hoja visible es la lista (la otra está oculta).
const hoja = /<sheet name="([^"]+)"(?![^>]*state="hidden")[^>]*r:id="(rId\d+)"/.exec(wb);
const target = new RegExp(`Id="${hoja[2]}"[^>]*Target="([^"]+)"`)
  .exec(rels)[1]
  .replace(/^\/?xl\//, '');
const xml = readFileSync(`${dir}/xl/${target}`, 'utf8');

// Fórmulas compartidas: la celda que no trae texto hereda la del maestro (si).
const maestro = new Map();
for (const m of xml.matchAll(/<f t="shared" ref="[^"]+" si="(\d+)">([^<]*)<\/f>/g))
  maestro.set(m[1], dec(m[2]));

const filas = [];
for (const r of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const celdas = { fila: Number(r[1]) };
  for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = /t="(\w+)"/.exec(c[2])?.[1];
    const cuerpo = c[3] ?? '';
    let v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? '';
    if (t === 's') v = shared[Number(v)];
    celdas[c[1]] = dec(String(v)).trim();
    if (c[1] === 'H') {
      const f = /<f([^>]*)>([^<]*)<\/f>|<f([^>]*)\/>/.exec(cuerpo);
      if (f) {
        const si = /si="(\d+)"/.exec(f[1] ?? f[3] ?? '')?.[1];
        celdas.formula = f[2] ? dec(f[2]) : (maestro.get(si) ?? '');
      }
    }
  }
  filas.push(celdas);
}

const catalogo = new Set(
  readFileSync(`${AQUI}/codigos_catalogo.txt`, 'utf8')
    .split('\n')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
);

const num = (s) => (s !== undefined && s !== '' && !Number.isNaN(Number(s)) ? Number(s) : null);
let rubro = null;
const porCodigo = new Map();
const pendientes = [];
for (const f of filas.filter((x) => x.fila >= 7 && x.fila < 341)) {
  const cod = (f.C ?? '').trim();
  const lista = num(f.E);
  if (lista === null) {
    // Fila de rubro: el título está en D o en C.
    const titulo = (f.D || f.C || '').trim();
    if (titulo) rubro = titulo;
    continue;
  }
  if (!cod) continue;
  const regalo = /regalo/i.test(f.G ?? '');
  const promo = regalo ? 0 : (num(f.G) ?? lista);
  const b = num(f.B);
  const porPack = /B\d+/.test(f.formula ?? '') || (!f.formula && /PACK$/i.test(cod));
  const x = {
    cod,
    nombre: (f.D ?? '').replace(/\s+/g, ' ').trim(),
    fila: f.fila,
    rubro,
    lista: Math.round(lista * 100) / 100,
    promo: Math.round(promo * 100) / 100,
    pack: porPack && b ? Math.round(b) : 1,
    minimo: !porPack && b ? Math.round(b) : null,
    regalo,
  };
  if (!catalogo.has(cod.toUpperCase())) {
    pendientes.push({ ...x, motivo: 'el código no está en el catálogo de productos' });
    continue;
  }
  if (x.promo > x.lista && x.lista > 0) {
    pendientes.push({ ...x, motivo: `precio con promoción (${x.promo}) mayor que el de lista` });
    continue;
  }
  const l = porCodigo.get(cod.toUpperCase()) ?? [];
  l.push(x);
  porCodigo.set(cod.toUpperCase(), l);
}

const cargar = [];
for (const [, l] of porCodigo) {
  const distintos = new Set(l.map((x) => `${x.promo}/${x.pack}`));
  if (distintos.size > 1) {
    for (const x of l)
      pendientes.push({
        ...x,
        motivo: `código repetido con precios distintos (${[...distintos].join(' · ')})`,
      });
    continue;
  }
  cargar.push(l[0]);
}

const sha = createHash('sha256').update(readFileSync(xlsx)).digest('hex');
const q = (s) => (s === null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const valores = cargar
  .map(
    (x) =>
      `  (${q(x.cod)}, ${q(x.rubro)}, ${x.fila}, ${x.lista.toFixed(2)}, ${x.promo.toFixed(2)}, ${x.pack}, ${x.minimo ?? 'null'}, ${x.regalo})`,
  )
  .join(',\n');

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Carga de la lista mayorista ${NUMERO_LISTA} (precio de lista y precio con
--             promoción por unidad, IVA incluido; unidades del pack o mínimo):
--             ${cargar.length} productos.
-- Reglas    : §4.12.1 (precios versionados). Pedido del 2026-10-01: «en todo lo
--             que sea ventas, esta es la lista más actualizada».
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/precios/generar_lista_mayorista.mjs. No editar a mano.
--
-- Archivo de origen: ${path.basename(xlsx)}, hoja «${hoja[1]}»
-- sha256: ${sha}
-- ${pendientes.length} filas quedaron afuera: scripts/precios/pendientes_mayorista.md.
--
-- A nombre de la Dirección Técnica activa, como las otras cargas. Desde acá,
-- cada cambio lo hace Ventas y queda a su nombre.

insert into comercial.lista_mayorista
  (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack, minimo,
   es_regalo, origen, cargado_por)
select p.id, '${NUMERO_LISTA}', v.rubro, v.fila, v.lista, v.promo, v.pack, v.minimo, v.regalo,
       format('Lista ${NUMERO_LISTA}, fila %s', v.fila),
       (select id from core.usuarios
         where rol = 'DIRECCION_TECNICA' and activo
         order by es_dt_titular desc, creado_en
         limit 1)
  from (values
${valores}
  ) as v(codigo, rubro, fila, lista, promo, pack, minimo, regalo)
  join gmp.productos p on upper(btrim(p.codigo_interno)) = upper(v.codigo) and p.tercero_id is null;
`;

// Clasificación de lo que no se cargó (pedido del 2026-10-01): no se da de
// alta nada; Dirección Técnica lo revisa. (a) producto simple que falta en el
// catálogo, (b) pack o caja: composición de SKUs (sin stock propio), (c) no
// identificado o no es un producto.
const promoDe = new Map(
  [...cargar, ...pendientes].map((x) => [x.cod.toUpperCase(), x.promo]),
);
const existe = (c) => catalogo.has(String(c).toUpperCase());
const marca = (c) => (existe(c) ? `\`${c}\`` : `\`${c}\` (no está en el catálogo)`);
// Las dos composiciones que no salen del código: se leen del nombre en la planilla.
const MANUALES = {
  '800PACK': '24 × \`801\` (no está) + 12 × \`802\` (no está) + 12 × \`803\` (no está) + 12 × \`804\` (no está)',
  '631PACK': '3 × cada uno de los 34 pigmentos (102 unidades); la planilla no dice cuáles 34: a confirmar',
};
const clasificar = (x) => {
  const cod = x.cod.toUpperCase();
  if (/^PROMO/i.test(x.nombre) || cod === 'PROMO')
    return { clase: 'c', detalle: 'Es una promoción de la planilla, no un producto: va como regla de precio.' };
  if (MANUALES[cod]) return { clase: 'b', detalle: MANUALES[cod] };
  const caja = /^CAJA(\d+)$/.exec(cod);
  if (caja) {
    const base = caja[1];
    const declarado = /x\s*(\d+)\s*u/i.exec(x.nombre)?.[1];
    const unidad = promoDe.get(base);
    const n = declarado
      ? Number(declarado)
      : unidad
        ? Math.round(x.promo / (unidad * 0.95))
        : null;
    return {
      clase: 'b',
      detalle: `${n ?? '¿?'} × ${marca(base)}${declarado ? '' : ' (unidades deducidas del precio con 5 % de descuento: a confirmar)'}`,
    };
  }
  const pack = /^(\d+)PACK$/.exec(cod);
  if (pack && x.pack > 1) return { clase: 'b', detalle: `${x.pack} × ${marca(pack[1])}` };
  if (/repetido/.test(x.motivo))
    return { clase: 'c', detalle: `El código \`${x.cod}\` aparece dos veces con precios distintos: ${x.motivo.split('(')[1]?.replace(')', '') ?? ''}` };
  return { clase: 'a', detalle: 'Producto simple: falta darlo de alta en el catálogo.' };
};
const grupos = { a: [], b: [], c: [] };
for (const p of [...pendientes].sort((a, b) => a.fila - b.fila)) {
  const c = clasificar(p);
  grupos[c.clase].push({ ...p, ...c });
}
const tabla = (l, conDetalle) =>
  [
    `| Fila | Código | Producto (planilla) | Precio con promo |${conDetalle ? ' Composición / nota |' : ''}`,
    `| --- | --- | --- | ---: |${conDetalle ? ' --- |' : ''}`,
    ...l.map(
      (p) =>
        `| ${p.fila} | ${p.cod} | ${p.nombre.replace(/\|/g, '/')} | ${p.promo} |${conDetalle ? ` ${p.detalle} |` : ''}`,
    ),
  ].join('\n');

const md = `# Lista mayorista ${NUMERO_LISTA}: filas que no se cargaron

Generado por \`scripts/precios/generar_lista_mayorista.mjs\` desde
\`${path.basename(xlsx)}\` (sha256 \`${sha.slice(0, 16)}…\`).

Se cargaron ${cargar.length} productos. Estas ${pendientes.length} filas quedaron afuera.
**No se dio de alta ninguno** (pedido del 2026-10-01): la clasificación es para
revisarla con Dirección Técnica. Los packs y cajas van a modelarse como
**composición** de SKUs existentes, sin stock propio.

## (a) Producto simple que falta en el catálogo — ${grupos.a.length}

${tabla(grupos.a, false)}

## (b) Pack o caja compuesta por SKUs — ${grupos.b.length}

La composición sale del código (\`142PACK\` = pack de \`142\`) y de las unidades
de la planilla. Donde el componente no está en el catálogo, se marca.

${tabla(grupos.b, true)}

## (c) No identificado o no es un producto — ${grupos.c.length}

${tabla(grupos.c, true)}
`;

// La clasificación se regenera siempre; la migración, solo si todavía no existe.
writeFileSync(path.join(AQUI, 'pendientes_mayorista.md'), md);
const archivo = path.join(salida, '20261001140000_carga_lista_mayorista.sql');
if (existsSync(archivo)) {
  console.log(`Ya existe ${archivo}: no se reescribe (una migración escrita no se edita).`);
} else {
  writeFileSync(archivo, sql);
}
console.log(
  `${cargar.length} para cargar (${cargar.filter((x) => x.pack > 1).length} por pack), ${pendientes.length} pendientes: ` +
    `(a) ${grupos.a.length}, (b) ${grupos.b.length}, (c) ${grupos.c.length}.`,
);
