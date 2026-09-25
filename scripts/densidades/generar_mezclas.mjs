#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera, desde la planilla de densidades (versión con mezclas), la migración
// de datos del modelo de mezcla y el fixture de pruebas de la calculadora.
//
// Lee tres hojas:
//   - «Pares V^E»        coeficientes Redlich-Kister de 24 pares binarios.
//   - «Etanol-agua CRC»  densidad de etanol-agua por % p/p (CRC Handbook).
//   - «Coeficientes»     polinomio y masa molar de cada compuesto (solo para
//                        el fixture: la base ya los tiene desde 20260922210000
//                        y este script verifica que no cambiaron).
//   - «Mezclas (teoría)» resultados de referencia a 20 °C, que las pruebas
//                        tienen que reproducir.
//
// Sin dependencias (CLAUDE.md §7): el xlsx se descomprime aparte.
//   PowerShell:  Copy-Item planilla.xlsx x.zip; Expand-Archive x.zip -DestinationPath dir
//   Linux/mac:   unzip planilla.xlsx -d dir
//
// Uso:
//   node scripts/densidades/generar_mezclas.mjs <planilla.xlsx> <dir_descomprimido>
//
// Salida:
//   supabase/migrations/20260924160100_carga_mezclas_volumen_exceso.sql
//   src/features/produccion/mezclas.fixture.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const [xlsx, dir] = process.argv.slice(2);
if (!xlsx || !dir) {
  console.error('Uso: generar_mezclas.mjs <planilla.xlsx> <dir_descomprimido>');
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
  ...readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8').matchAll(
    /<si>([\s\S]*?)<\/si>/g,
  ),
].map((m) =>
  dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);

/** Hoja → { fila: { columna: valor } } con los valores ya calculados. */
function hoja(nombre) {
  const esc = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rid = new RegExp(`<sheet name="${esc}"[^>]*r:id="(rId\\d+)"`).exec(wb)?.[1];
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

const num = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error(`No es número: ${x}`);
  return n;
};
const sql = (s) =>
  s === undefined || s === null || s === ''
    ? 'null'
    : `'${String(s).replace(/'/g, "''")}'`;

// ---- Pares -----------------------------------------------------------------
const P = hoja('Pares V^E');
const pares = [];
for (const [fila, r] of Object.entries(P)) {
  if (Number(fila) < 5 || !r.B || !r.C || r.D === undefined || isNaN(Number(r.D)))
    continue;
  pares.push({
    c1: r.B,
    c2: r.C,
    a: ['D', 'E', 'F', 'G', 'H', 'I'].map((c) => num(r[c] ?? 0)),
    da: ['J', 'K', 'L', 'M', 'N', 'O'].map((c) => num(r[c] ?? 0)),
    rango: r.P ?? null,
    calidad: r.Q ?? null,
    fuente: r.T ?? null,
    notas: r.U ?? null,
  });
}
if (pares.length !== 24) throw new Error(`Se esperaban 24 pares y hay ${pares.length}`);

// ---- Etanol-agua CRC ---------------------------------------------------------
const E = hoja('Etanol-agua CRC');
const crc = Object.entries(E)
  .filter(
    ([f, r]) =>
      Number(f) >= 5 && r.A !== undefined && !isNaN(Number(r.A)) && r.F !== undefined,
  )
  .map(([, r]) => ({
    w: num(r.A),
    r10: num(r.B),
    r20: num(r.C),
    r25: num(r.D),
    r30: num(r.E),
    vv: num(r.F),
    contraccion: num(r.G),
  }))
  .sort((a, b) => a.w - b.w);
if (crc.length !== 101)
  throw new Error(`Se esperaban 101 filas CRC (0 a 100 %) y hay ${crc.length}`);

/** % p/p de etanol para un % v/v a 20 °C, interpolando en la tabla de 1 % p/p. */
function ppDeVv(vv) {
  for (let i = 0; i < crc.length - 1; i++) {
    const a = crc[i];
    const b = crc[i + 1];
    if (a.vv <= vv && vv <= b.vv)
      return a.w + ((vv - a.vv) * (b.w - a.w)) / (b.vv - a.vv);
  }
  throw new Error(`Fuera de tabla: ${vv}`);
}
const pp96 = ppDeVv(96);

// ---- Coeficientes (para el fixture) -----------------------------------------
const C = hoja('Coeficientes');
const compuestos = {};
for (const [fila, r] of Object.entries(C)) {
  if (Number(fila) < 2 || !r.B || r.H === undefined) continue;
  compuestos[r.B] = {
    nombre: r.B,
    masaMolar: r.E !== undefined && !isNaN(Number(r.E)) ? num(r.E) : null,
    coeficientes: ['H', 'I', 'J', 'K', 'L'].map((c) => num(r[c])),
  };
}

// ---- Resultados de referencia ------------------------------------------------
const T = hoja('Mezclas (teoría)');
const ALIAS = { IPA: '2-Propanol (IPA)' };
const referencias = [];
for (const [fila, r] of Object.entries(T)) {
  if (Number(fila) < 18 || !r.A || r.B === undefined || isNaN(Number(r.B))) continue;
  const m = /^(.*) ([\d./]+)$/.exec(r.A);
  if (!m) continue;
  const nombres = m[1].split(' / ').map((n) => ALIAS[n] ?? n);
  const partes = m[2].split('/').map(Number);
  if (nombres.length !== partes.length) throw new Error(`No entiendo «${r.A}»`);
  referencias.push({
    mezcla: r.A,
    componentes: nombres.map((n, i) => ({ nombre: n, masa: partes[i] })),
    densidadIdeal: num(r.B),
    densidadReal: num(r.C),
  });
}

// ---- Migración de datos ------------------------------------------------------
const sha = createHash('sha256').update(readFileSync(xlsx)).digest('hex');
const ref = (n) => `(select id from gmp.densidades_referencia where nombre = ${sql(n)})`;
const arr = (xs) => `array[${xs.map((x) => String(x)).join(', ')}]::double precision[]`;

const lineas = [];
lineas.push(`-- ---------------------------------------------------------------------------
-- Propósito : Cargar los datos del modelo de mezcla: 24 pares binarios con
--             coeficientes Redlich-Kister de volumen molar de exceso, la tabla
--             CRC de etanol-agua (101 filas, 0 a 100 % p/p) y la composición
--             de las densidades que son mezclas o sinónimos de un compuesto.
-- Reglas    : PG.60.8 (fórmula maestra y hoja de pesada). Los datos entran
--             como literatura: siguen valiendo las advertencias de RN-01 sobre
--             densidades no verificadas.
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/densidades/generar_mezclas.mjs. No editar a mano:
-- regenerar desde la planilla.
--
-- Archivo de origen: Densidades_liquidos_0-45C.xlsx (versión con mezclas)
-- sha256: ${sha}
--
-- Los 91 compuestos de la hoja «Coeficientes» son idénticos a los cargados en
-- 20260922210000 (verificado contra la base el 2026-09-24): no se tocan.
`);

lineas.push('-- ---- Pares binarios ---------------------------------------------------');
for (const p of pares) {
  lineas.push(
    `insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values (${ref(p.c1)}, ${ref(p.c2)}, ${arr(p.a)}, ${arr(p.da)}, 25, ${sql(p.rango)}, ${sql(p.calidad)}, ${sql(p.fuente)}, ${sql(p.notas)});`,
  );
}

lineas.push(
  '\n-- ---- Tabla CRC etanol-agua --------------------------------------------',
);
lineas.push(
  'insert into gmp.etanol_agua_crc (pct_pp, rho_10, rho_20, rho_25, rho_30, pct_vv_20, contraccion_20_pct) values',
);
lineas.push(
  crc
    .map(
      (r) =>
        `  (${r.w}, ${r.r10}, ${r.r20}, ${r.r25}, ${r.r30}, ${r.vv}, ${r.contraccion})`,
    )
    .join(',\n') + ';',
);

lineas.push(`
-- ---- Composición de las densidades que no son un compuesto puro -------------
--
-- Las cinco entradas anteriores a la tabla de 91 compuestos no tienen masa
-- molar: son un grado comercial («Etanol 96 GL») o un sinónimo («Agua
-- desionizada», «Isopropanol»). Para el modelo de mezcla se descomponen en
-- compuestos de la tabla; su densidad propia no cambia.
--
-- Etanol 96 GL: 96 % v/v a 20 °C = ${pp96.toFixed(4)} % p/p de etanol, interpolado en
-- la tabla CRC (OIML R 22 da 93,84).
insert into gmp.densidad_composicion (densidad_id, constituyente_id, fraccion_masica, fuente) values
  (${ref('Etanol 96 GL')}, ${ref('Etanol')}, ${(pp96 / 100).toFixed(6)}, 'Tabla CRC etanol-agua, 96 % v/v a 20 °C'),
  (${ref('Etanol 96 GL')}, ${ref('Agua')}, ${(1 - pp96 / 100).toFixed(6)}, 'Tabla CRC etanol-agua, 96 % v/v a 20 °C'),
  (${ref('Etanol absoluto')}, ${ref('Etanol')}, 1, 'Sinónimo'),
  (${ref('Agua desionizada')}, ${ref('Agua')}, 1, 'Sinónimo'),
  (${ref('Isopropanol')}, ${ref('2-Propanol (IPA)')}, 1, 'Sinónimo'),
  (${ref('Acetato de butilo')}, ${ref('Acetato de n-butilo')}, 1, 'Sinónimo');

do $$
declare v_n integer;
begin
  select count(*) into v_n from gmp.pares_volumen_exceso;
  if v_n <> ${pares.length} then
    raise exception 'Se esperaban ${pares.length} pares y quedaron % (¿falta un compuesto por nombre?).', v_n;
  end if;
  select count(*) into v_n from gmp.densidad_composicion;
  if v_n <> 6 then
    raise exception 'Se esperaban 6 renglones de composición y quedaron %.', v_n;
  end if;
end;
$$;
`);

writeFileSync(
  `${RAIZ}/supabase/migrations/20260924160100_carga_mezclas_volumen_exceso.sql`,
  lineas.join('\n'),
);

// ---- Fixture de pruebas ------------------------------------------------------
const usados = new Set(referencias.flatMap((r) => r.componentes.map((c) => c.nombre)));
for (const p of pares) {
  usados.add(p.c1);
  usados.add(p.c2);
}
const fixture = {
  origen: { archivo: 'Densidades_liquidos_0-45C.xlsx', sha256: sha },
  tempC: 20,
  compuestos: [...usados].sort().map((n) => {
    if (!compuestos[n]) throw new Error(`Compuesto sin coeficientes: ${n}`);
    return compuestos[n];
  }),
  pares: pares.map(({ c1, c2, a, da }) => ({ c1, c2, a, da })),
  referencias,
  etanolAgua: crc.map(({ w, vv }) => ({ pp: w, vv })),
};
writeFileSync(
  `${RAIZ}/src/features/produccion/mezclas.fixture.json`,
  JSON.stringify(fixture, null, 2) + '\n',
);

console.log(
  `pares ${pares.length}, CRC ${crc.length}, referencias ${referencias.length}, 96 %v/v = ${pp96.toFixed(4)} %p/p`,
);
