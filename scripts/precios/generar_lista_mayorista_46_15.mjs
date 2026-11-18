#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la carga de la lista mayorista 46.15 desde «46.15 NAIL SHOW NOVIEMBRE
// 2026 MAYORISTAS» (hoja «LISTA 46.15», pedido del 2026-11-18).
//
// Misma planilla que la 46.14 (ver generar_lista_mayorista.mjs): B mínimo o
// unidades del pack, C código, D producto, E precio de lista, G precio con
// promoción por unidad («DE REGALO» = 0), H total de la fila.
// Diferencia con la 46.14: desde el 2026-11-10 los «código PACK» se venden por
// unidad con su código numérico (20261110150100). «142PACK» entra como «142»,
// con unidades_pack = 1 y el tamaño del pack como mínimo; el precio de G ya es
// por unidad. Un código sin unitario en el catálogo (632PACK, 613…) sigue como
// en la 46.14: pack si el total multiplica por B.
// Lo que no está en el catálogo (cajas, promos, combos) no se carga: se lista
// en pendientes_mayorista_46_15.md.
//
// Sin dependencias (CLAUDE.md §7): el xlsx se descomprime aparte.
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//
// Uso:
//   node scripts/precios/generar_lista_mayorista_46_15.mjs <planilla.xlsx> <dir> <catalogo.txt>
// catalogo.txt: un código por línea de los productos propios (tercero_id null),
// consultado de la base al generar.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const [xlsx, dir, catalogoTxt] = process.argv.slice(2);
if (!xlsx || !dir || !catalogoTxt) {
  console.error('Uso: generar_lista_mayorista_46_15.mjs <planilla.xlsx> <dir_descomprimido> <catalogo.txt>');
  process.exit(1);
}

const NUMERO_LISTA = '46.15';
const MIGRACION = '20261118150000_carga_lista_mayorista_46_15.sql';
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
const hoja = /<sheet name="([^"]+)"(?![^>]*state="hidden")[^>]*r:id="(rId\d+)"/.exec(wb);
const target = new RegExp(`Id="${hoja[2]}"[^>]*Target="([^"]+)"`)
  .exec(rels)[1]
  .replace(/^\/?xl\//, '');
const xml = readFileSync(`${dir}/xl/${target}`, 'utf8');

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
  readFileSync(catalogoTxt, 'utf8')
    .split('\n')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
);

// La lista termina en la fila «TOTAL COMPRA».
const fin = filas.find((f) => /^TOTAL COMPRA$/i.test(f.A ?? ''))?.fila;
if (!fin) throw new Error('No se encontró la fila «TOTAL COMPRA».');

const num = (s) => (s !== undefined && s !== '' && !Number.isNaN(Number(s)) ? Number(s) : null);
const r2 = (n) => Math.round(n * 100) / 100;
let rubro = null;
const cargar = [];
const pendientes = [];
for (const f of filas.filter((x) => x.fila >= 7 && x.fila < fin)) {
  const orig = (f.C ?? '').trim();
  const lista = num(f.E);
  if (lista === null) {
    const titulo = (f.D || f.C || '').trim();
    if (titulo) rubro = titulo;
    continue;
  }
  if (!orig) continue;
  const regalo = /regalo/i.test(f.G ?? '');
  const promo = regalo ? 0 : (num(f.G) ?? lista);
  const b = num(f.B);
  const x = {
    cod: orig.toUpperCase(),
    orig,
    nombre: (f.D ?? '').replace(/\s+/g, ' ').trim(),
    fila: f.fila,
    rubro,
    lista: r2(lista),
    promo: r2(promo),
    regalo,
  };
  const unidad = /^(\d+)PACK$/i.exec(orig)?.[1];
  if (unidad && catalogo.has(unidad)) {
    // Venta por unidad (20261110150100): el pack queda como mínimo.
    Object.assign(x, { cod: unidad, pack: 1, minimo: b && b > 1 ? Math.round(b) : null });
  } else {
    const porPack = /B\d+/.test(f.formula ?? '') || (!f.formula && /PACK$/i.test(orig));
    Object.assign(x, {
      pack: porPack && b ? Math.round(b) : 1,
      minimo: !porPack && b ? Math.round(b) : null,
    });
  }
  if (!catalogo.has(x.cod)) {
    pendientes.push({ ...x, motivo: 'no está en el catálogo (caja, promo o combo)' });
    continue;
  }
  if (x.promo > x.lista && x.lista > 0) {
    pendientes.push({ ...x, motivo: `precio con promoción (${x.promo}) mayor que el de lista` });
    continue;
  }
  // Un código repetido: vale la primera fila; la otra es una promo del mismo
  // producto (419: «llevando 36 el exhibidor va de regalo»).
  if (cargar.some((y) => y.cod === x.cod)) {
    pendientes.push({ ...x, motivo: 'código repetido: se cargó la primera fila' });
    continue;
  }
  cargar.push(x);
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
--             promoción por unidad, IVA incluido; mínimo o unidades del pack):
--             ${cargar.length} productos. Pasa a ser la lista vigente.
-- Reglas    : §4.12.1 (precios versionados, lista append-only). Pedido de
--             Administración del 2026-11-18: el formulario de Pedido nuevo no
--             ofrecía productos de la 46.15 que no estaban en la 46.14 (142,
--             143, 144, 151, 154, 160, 195, 235, 801, 78, 79…).
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/precios/generar_lista_mayorista_46_15.mjs. No editar a mano.
--
-- Archivo de origen: ${path.basename(xlsx)}, hoja «${hoja[1]}»
-- sha256: ${sha}
-- ${pendientes.length} filas quedaron afuera: scripts/precios/pendientes_mayorista_46_15.md.
--
-- Una fila nueva por producto (rige la última). Los «código PACK» entran con
-- su código numérico, por unidad, con el pack como mínimo (20261110150100).
-- La alícuota de IVA se conserva de la fila vigente (21 si es nuevo). Un
-- producto que estaba en la 46.14 y no figura en la 46.15 no se retira: queda
-- con su fila de la 46.14. La escala de descuento de la 46.15 es la misma.
-- A nombre de Administración, como las demás cargas de la lista.

do $$
declare
  v_adm uuid;
  v_n   integer;
begin
  select id into v_adm
    from core.usuarios
   where email = 'nailshowargentina@hotmail.com' and rol = 'ADMINISTRACION' and activo;
  if v_adm is null then
    raise exception 'No está activa la cuenta de Administración (nailshowargentina@hotmail.com), a cuyo nombre va la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_adm::text, 'rol', 'ADMINISTRACION',
                      'roles', json_build_array('ADMINISTRACION'))::text,
    true
  );

  insert into comercial.lista_mayorista
    (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack, minimo,
     es_regalo, alicuota_iva, origen)
  select p.id, '${NUMERO_LISTA}', v.rubro, v.fila, v.lista, v.promo, v.pack, v.minimo, v.regalo,
         coalesce(l.alicuota_iva, 21), format('Lista ${NUMERO_LISTA}, fila %s', v.fila)
    from (values
${valores}
    ) as v(codigo, rubro, fila, lista, promo, pack, minimo, regalo)
    join gmp.productos p on upper(btrim(p.codigo_interno)) = upper(v.codigo) and p.tercero_id is null
    left join comercial.v_lista_mayorista l on l.producto_id = p.id;
  get diagnostics v_n = row_count;
  if v_n <> ${cargar.length} then
    raise exception 'Se esperaban ${cargar.length} productos de la lista ${NUMERO_LISTA} y se cargaron %.', v_n;
  end if;
end;
$$;
`;

const tabla = (l) =>
  [
    '| Fila | Código | Producto (planilla) | Precio con promo | Motivo |',
    '| --- | --- | --- | ---: | --- |',
    ...l.map((p) => `| ${p.fila} | ${p.orig} | ${p.nombre.replace(/\|/g, '/')} | ${p.promo} | ${p.motivo} |`),
  ].join('\n');

const md = `# Lista mayorista ${NUMERO_LISTA}: filas que no se cargaron

Generado por \`scripts/precios/generar_lista_mayorista_46_15.mjs\` desde
\`${path.basename(xlsx)}\` (sha256 \`${sha.slice(0, 16)}…\`).

Se cargaron ${cargar.length} productos. Estas ${pendientes.length} filas quedaron afuera.

${tabla(pendientes)}
`;

writeFileSync(path.join(AQUI, 'pendientes_mayorista_46_15.md'), md);
const archivo = path.join(RAIZ, 'supabase/migrations', MIGRACION);
if (existsSync(archivo)) {
  console.log(`Ya existe ${archivo}: no se reescribe (una migración escrita no se edita).`);
} else {
  writeFileSync(archivo, sql);
}
console.log(
  `${cargar.length} para cargar (${cargar.filter((x) => x.pack > 1).length} por pack), ${pendientes.length} afuera.`,
);
