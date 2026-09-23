#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la migración que carga gmp.materiales_acondicionamiento desde
// cvd_celeste.csv (salida de extraer_cvd.mjs) y las decisiones de
// decisiones.mjs.
//
// No escribe contra la base (CLAUDE.md §6: la migración se escribe antes de
// aplicarse). Cruza contra el catálogo leído de las migraciones versionadas,
// igual que scripts/apertura/generar_migracion.mjs.
//
// Uso:
//   node scripts/lista_materiales/generar_migracion.mjs
//
// Salida:
//   supabase/migrations/20260923140000_carga_lista_materiales_cvd.sql
//   scripts/lista_materiales/pendientes.md
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOQUES, CODIGOS, DENSIDADES, UNIDADES } from './decisiones.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const MIG = path.join(RAIZ, 'supabase', 'migrations');
const SALIDA = path.join(MIG, '20260923140000_carga_lista_materiales_cvd.sql');
const origen = JSON.parse(readFileSync(path.join(AQUI, 'origen.json'), 'utf8'));

// ---- CSV -------------------------------------------------------------------
function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') ((campo += '"'), i++);
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') (fila.push(campo), (campo = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      (fila.push(campo), filas.push(fila), (fila = []), (campo = ''));
    } else campo += ch;
  }
  if (campo || fila.length) (fila.push(campo), filas.push(fila));
  const [cab, ...resto] = filas.filter((f) => f.some((c) => c !== ''));
  return resto.map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ''])));
}
const renglones = parseCsv(readFileSync(path.join(AQUI, 'cvd_celeste.csv'), 'utf8'));

// ---- Catálogo desde las migraciones ----------------------------------------
const insumos = new Map();
const productos = new Set();
for (const f of readdirSync(MIG)
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  if (f === path.basename(SALIDA)) continue;
  const s = readFileSync(path.join(MIG, f), 'utf8');
  if (s.includes('insert into gmp.insumos_catalogo')) {
    const patron =
      /\(\s*'([^']+)',\s*'[^']*',\s*'(MATERIA_PRIMA|MATERIAL_ENVASE|MATERIAL_EMPAQUE|ETIQUETA|SEMIELABORADO)',\s*(null|'[^']*')/g;
    for (const m of s.matchAll(patron)) {
      const unidad =
        m[3] === 'null'
          ? m[2] === 'MATERIA_PRIMA'
            ? 'g'
            : null
          : m[3].replace(/'/g, '');
      insumos.set(m[1].toUpperCase(), { codigo: m[1], tipo: m[2], unidad });
    }
  }
  for (const m of s.matchAll(
    /update gmp\.insumos_catalogo\s+set unidad_medida = '([^']+)'\s+where codigo_interno = '([^']+)'/g,
  )) {
    const x = insumos.get(m[2].toUpperCase());
    if (x) x.unidad = m[1];
  }
  if (s.includes('insert into gmp.productos')) {
    for (const m of s.matchAll(/\(\s*'([^']+)',\s*'[^']*'\s*\)/g)) productos.add(m[1]);
  }
}

// ---- Resolución ------------------------------------------------------------
const cargar = [];
const pendientes = [];
const vistos = new Set();

for (const r of renglones) {
  const bloque = BLOQUES[r.bloque];
  const ref = `${r.bloque} fila ${r.fila}`;
  const desc = `${r.insumo_codigo || '(sin código)'} ${r.insumo_nombre_planilla} = ${r.cantidad}`;
  if (!bloque) throw new Error(`Bloque ${r.bloque} sin decisión en decisiones.mjs`);
  if (!bloque.producto) {
    pendientes.push({
      grupo: 'Bloque sin producto',
      ref,
      bloque: r.bloque,
      desc,
      motivo: bloque.razon,
    });
    continue;
  }
  if (!productos.has(bloque.producto))
    throw new Error(`Producto ${bloque.producto} no está en el catálogo`);

  // Código corregido por decisión (referencia rota en la planilla).
  const correccion = CODIGOS[`${r.bloque}:${r.fila}`];
  const cod = (correccion?.codigo ?? r.insumo_codigo).toUpperCase();
  const ins = insumos.get(cod);
  if (!ins) {
    pendientes.push({
      grupo: 'Insumo fuera del catálogo',
      ref,
      bloque: r.bloque,
      desc,
      motivo:
        /^(0|\d{5})$/.test(r.insumo_codigo) || !r.insumo_codigo
          ? 'la celda de código no trae un código de insumo (vacía o referencia rota)'
          : `«${r.insumo_codigo}» no está en gmp.insumos_catalogo`,
    });
    continue;
  }

  const cantidad = Number(r.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    pendientes.push({
      grupo: 'Cantidad inválida',
      ref,
      bloque: r.bloque,
      desc,
      motivo: 'no es un número positivo',
    });
    continue;
  }

  // Conversión de la unidad de la planilla a la del catálogo.
  //   catálogo g : g ×1 · kg ×1000 · ml ×ρ · L ×1000×ρ
  //   catálogo ml: ml ×1 · L ×1000 (la esencia y los granel líquidos)
  //   UNIDAD     : conteo
  let unidad;
  let factor = 1;
  let compuesto = null;
  let razon = correccion ? `código corregido a ${ins.codigo}: ${correccion.razon}` : '';
  if (ins.unidad === 'UNIDAD') {
    unidad = 'u';
  } else if (ins.unidad === 'g' || ins.unidad === 'ml') {
    const u = UNIDADES[`${r.bloque}:${cod}`];
    if (!u || !u.unidad) {
      pendientes.push({
        grupo: u
          ? 'Unidad de la planilla ambigua'
          : 'Unidad de la planilla sin determinar',
        ref,
        bloque: r.bloque,
        desc,
        motivo: u ? u.razon : 'sin lectura de unidad en decisiones.mjs',
      });
      continue;
    }
    unidad = u.unidad;
    razon = [razon, u.razon].filter(Boolean).join('; ');
    const tabla =
      ins.unidad === 'g'
        ? { g: [1, false], kg: [1000, false], ml: [1, true], L: [1000, true] }
        : { ml: [1, false], L: [1000, false] };
    const conv = tabla[unidad];
    if (!conv) {
      pendientes.push({
        grupo: 'Unidad de la planilla incompatible',
        ref,
        bloque: r.bloque,
        desc: `${desc} ${unidad}`,
        motivo: `el catálogo lleva el insumo en ${ins.unidad} y la planilla lo da en ${unidad}`,
      });
      continue;
    }
    factor = conv[0];
    if (conv[1]) {
      compuesto = DENSIDADES[cod]?.compuesto ?? null;
      if (!compuesto) {
        pendientes.push({
          grupo: 'Líquido sin densidad cargada',
          ref,
          bloque: r.bloque,
          desc: `${desc} ${unidad}`,
          motivo:
            'no hay compuesto de gmp.densidades_referencia asignado a este insumo: no se puede pasar a gramos',
        });
        continue;
      }
    }
  } else {
    pendientes.push({
      grupo: 'Insumo sin unidad en el catálogo',
      ref,
      bloque: r.bloque,
      desc,
      motivo: `unidad «${ins.unidad}»`,
    });
    continue;
  }

  const clave = `${bloque.producto}|${ins.codigo}`;
  if (vistos.has(clave)) throw new Error(`Insumo repetido en el producto: ${clave}`);
  vistos.add(clave);

  cargar.push({
    producto: bloque.producto,
    insumo: ins.codigo,
    cantidad,
    unidad,
    factor,
    unidadCatalogo: ins.unidad,
    compuesto,
    origen: `C.V.D. ${r.bloque} fila ${r.fila}: ${r.cantidad} ${unidad}${unidad !== 'u' && unidad !== ins.unidad ? ` → ${ins.unidad}` : ''}${razon ? ` (${razon})` : ''}`,
  });
}

// ---- SQL -------------------------------------------------------------------
const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const valores = cargar
  .map(
    (c) =>
      `  (${q(c.producto)}, ${q(c.insumo)}, ${c.cantidad}, ${c.factor}, ${q(c.compuesto)}, ${q(c.origen)})`,
  )
  .join(',\n');
const productosCargados = [...new Set(cargar.map((c) => c.producto))];
const convertidos = cargar.filter((c) => c.compuesto).length;

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Cargar la lista de materiales de cada producto terminado desde
--             la hoja «C.V.D.» de la planilla de inventario, solo los bloques
--             en celeste. Alimenta la explosión de pedidos y la baja de stock
--             al terminarlos (20260923130000).
-- Reglas    : §3.3 (Gerencia de Producción define la lista de materiales),
--             RN-50 (auditoría de la carga).
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- GENERADA, NO ESCRITA A MANO. Sale de:
--   scripts/lista_materiales/extraer_cvd.mjs     xlsx → cvd_celeste.csv
--   scripts/lista_materiales/decisiones.mjs      qué bloque es qué producto,
--                                                en qué unidad está cada
--                                                cantidad, con qué densidad
--   scripts/lista_materiales/generar_migracion.mjs  → este archivo
-- Origen: ${origen.archivo_origen} (hoja ${origen.hoja}), sha256
-- ${origen.sha256_xlsx}.
-- Para corregir algo: se cambia decisiones.mjs y se genera una migración
-- nueva. Esta no se edita una vez aplicada (CLAUDE.md §6).
--
-- QUÉ ENTRA. ${cargar.length} renglones para ${productosCargados.length} productos, de ${origen.renglones} renglones
-- celestes en ${origen.bloques} bloques. ${convertidos} renglones de líquidos se pasan de ml o litros a
-- gramos con gmp.densidad_a(…, 20 °C); la densidad y el compuesto usados
-- quedan escritos en la columna \`origen\` de cada fila.
--
-- QUÉ NO ENTRA, Y POR QUÉ. ${pendientes.length} renglones, listados en
-- scripts/lista_materiales/pendientes.md, cada uno con su motivo: variantes no
-- vigentes o discontinuadas, bloques cuyo producto no está en el catálogo, los
-- componentes de los DUO (son productos terminados, no insumos) y la etiqueta
-- de lote del primer, que no tiene código en la planilla. Los insumos que
-- faltaban en el catálogo se dieron de alta en 20260923135000. **Un producto
-- con renglones afuera va a mostrar menos faltantes de los reales para esos
-- insumos**: la lista está incompleta en esos puntos, no esos insumos sobran.
--
-- UNIDADES. Materia prima y crema a granel en gramos (volumen × densidad a
-- 20 °C, o kg × 1000); esencia y granel líquido sin densidad medida (primer,
-- bonder, removedor) en ml; envases, cierres y etiquetas en unidades.
--
-- ON CONFLICT DO NOTHING: si alguien ya cargó a mano un insumo para un
-- producto desde la pantalla, se respeta lo suyo y esta carga no lo pisa.

alter table gmp.materiales_acondicionamiento
  add column if not exists origen text;

comment on column gmp.materiales_acondicionamiento.origen is
  'De dónde salió la cantidad: celda de la planilla, unidad original y, si se convirtió, densidad usada. NULL = cargada a mano.';
comment on table gmp.materiales_acondicionamiento is
  'Lista de materiales por unidad de producto terminado: envase, tapa, etiqueta y, donde la planilla lo declara, las materias primas del granel. En la unidad de medida del insumo.';

do $$
declare
  v_sin_densidad text;
begin
  create temp table _cvd (
    producto  text,
    insumo    text,
    cantidad  numeric,
    factor    numeric,
    compuesto text,
    origen    text
  ) on commit drop;

  insert into _cvd values
${valores};

  -- Un líquido sin densidad en la base no se convierte a ojo: se aborta.
  select string_agg(c.insumo || ' (' || c.compuesto || ')', ', ')
    into v_sin_densidad
    from _cvd c
   where c.compuesto is not null
     and not exists (
       select 1 from gmp.densidades_referencia d where d.nombre = c.compuesto and d.activo
     );
  if v_sin_densidad is not null then
    raise exception 'Faltan densidades en gmp.densidades_referencia: %', v_sin_densidad;
  end if;

  insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, origen)
  select
    p.id,
    i.id,
    round(
      -- densidad_a() rechaza un id nulo: la densidad se pide solo si hay.
      c.cantidad * c.factor * case when d.id is null then 1 else gmp.densidad_a(d.id, 20) end,
      6),
    c.origen || case
      when d.id is not null then format(' × %s g/ml (%s, 20 °C)', round(gmp.densidad_a(d.id, 20), 5), d.nombre)
      else ''
    end
  from _cvd c
  join gmp.productos p        on p.codigo_interno = c.producto
  join gmp.insumos_catalogo i on i.codigo_interno = c.insumo
  left join gmp.densidades_referencia d on d.nombre = c.compuesto and d.activo
  on conflict (producto_id, insumo_id) do nothing;

  -- Todo renglón tiene que haber encontrado su producto y su insumo.
  if (select count(*) from _cvd c
        join gmp.productos p        on p.codigo_interno = c.producto
        join gmp.insumos_catalogo i on i.codigo_interno = c.insumo) <> ${cargar.length} then
    raise exception 'Hay renglones cuyo producto o insumo no está en la base.';
  end if;
end;
$$;
`;
writeFileSync(SALIDA, sql);

// ---- Pendientes ------------------------------------------------------------
let md = `# Lista de materiales C.V.D. — renglones que no se cargaron

Generado por \`generar_migracion.mjs\`. Origen: ${origen.archivo_origen}, hoja ${origen.hoja},
solo celdas celestes. ${cargar.length} renglones cargados, ${pendientes.length} afuera.

Cada grupo dice qué hace falta para que el renglón entre. Se resuelven en
\`decisiones.mjs\` (o en el catálogo) y se genera una migración nueva.

`;
const grupos = [...new Set(pendientes.map((p) => p.grupo))];
for (const g of grupos) {
  const items = pendientes.filter((p) => p.grupo === g);
  md += `## ${g} (${items.length})\n\n`;
  for (const p of items) md += `- \`${p.ref}\` — ${p.desc}. ${p.motivo}.\n`;
  md += '\n';
}
writeFileSync(path.join(AQUI, 'pendientes.md'), md);

console.log(
  `${cargar.length} renglones a cargar en ${productosCargados.length} productos (${convertidos} convertidos por densidad).`,
);
console.log(
  `${pendientes.length} afuera:`,
  Object.fromEntries(
    grupos.map((g) => [g, pendientes.filter((p) => p.grupo === g).length]),
  ),
);
