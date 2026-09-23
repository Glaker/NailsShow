#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Script de importación del saldo inicial de apertura
// (docs/ESPEC_SALDO_INICIAL.md).
//
// QUÉ HACE Y QUÉ NO HACE.
// No escribe contra la base. CLAUDE.md prohíbe DDL o carga de datos sueltos
// por fuera de una migración versionada («la migración se escribe antes de
// aplicarse»). Este script lee el CSV de origen, lo cruza contra el catálogo
// YA CARGADO en gmp.insumos_catalogo (leído de las migraciones existentes,
// no de la base viva: no hay conexión desde acá) y genera un archivo de
// migración nuevo en supabase/migrations/ con los INSERT ya resueltos. Ese
// archivo es el que se aplica con `supabase db push`, como cualquier otro.
//
// ALCANCE: SOLO CÓDIGOS QUE YA ESTÁN EN gmp.insumos_catalogo.
// El catálogo hoy cubre envases, empaques, etiquetas, semielaborados y
// materias primas (339 códigos, migraciones …150000 y …140000 de
// 2026-09-10/11). La planilla de origen trae además herramientas, mobiliario,
// merchandising, libros y otras 9 categorías que no son insumo GMP y que no
// tienen (ni deberían tener sin que la Gerencia lo confirme) un
// tipo_insumo_enum asignable. Decidir esa clasificación es una tarea de
// catálogo, no de carga de saldo. Este script deja esos códigos afuera y los
// lista en pendientes.md para que se resuelvan aparte (docs/DECISIONES_ABIERTAS.md).
//
// Uso:
//   node scripts/apertura/generar_migracion.mjs
//
// Salida:
//   supabase/migrations/<timestamp>_carga_saldo_apertura.sql
//   scripts/apertura/pendientes.md   (códigos excluidos, para revisión manual)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const CSV_PATH = path.join(__dirname, 'inventario_apertura.csv');
const ORIGEN_PATH = path.join(__dirname, 'origen.json');
const PENDIENTES_PATH = path.join(__dirname, 'pendientes.md');

const FECHA_CORTE = '2026-09-22';

// Identidad del archivo de origen, producida por `xlsx_a_csv.py`. El hash es
// el del **xlsx**, no el del csv: el xlsx es la fuente y el csv un intermedio
// de esa herramienta. `gmp.migracion_apertura.hash_archivo` guarda esto como
// evidencia de integridad, y una evidencia sobre un intermedio no sirve para
// demostrar de qué planilla salió el saldo.
const origen = JSON.parse(readFileSync(ORIGEN_PATH, 'utf8'));
const ARCHIVO_ORIGEN = `${origen.archivo_origen} (hoja ${origen.hoja})`;

// ===========================================================================
// 1. Parseo de CSV (con soporte de campos entre comillas, coma y comillas
//    escapadas) — sin dependencias externas, CLAUDE.md §7: nada de paquetes
//    nuevos sin justificarlos, y un parser de una planilla de 650 filas no
//    los justifica.
// ===========================================================================

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normaliza fin de línea antes de recorrer carácter por carácter.
  const s = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Cantidades que no eran un número limpio y de las que se tomó el número inicial. */
const cantidadesImprecisas = [];

/**
 * La columna CANTIDAD casi siempre es un número, pero la planilla trae algún
 * renglón escrito a mano («1 litro»). Se toma el número que encabeza el texto
 * y se deja constancia: descartarlo silenciosamente perdería una existencia
 * declarada, y adivinarlo sin registro sería peor.
 */
function toNumberOrNull(text) {
  const t = (text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (Number.isFinite(n)) return n;

  const m = /^(-?\d+(?:[.,]\d+)?)/.exec(t);
  if (!m) return null;
  const parcial = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(parcial)) return null;
  cantidadesImprecisas.push({ original: t, tomado: parcial });
  return parcial;
}

// ===========================================================================
// 2. Códigos ya cargados en gmp.insumos_catalogo, leídos de las migraciones
//    versionadas (no de la base: este script no se conecta a Supabase).
// ===========================================================================

function codigosDelCatalogo() {
  const archivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const codigos = new Set();
  const patron =
    /'([A-Za-z0-9]+)',\s*'[^']*',\s*'(MATERIA_PRIMA|MATERIAL_ENVASE|MATERIAL_EMPAQUE|ETIQUETA|SEMIELABORADO)'/g;
  for (const archivo of archivos) {
    const contenido = readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
    if (!contenido.includes('insert into gmp.insumos_catalogo')) continue;
    for (const m of contenido.matchAll(patron)) {
      codigos.add(m[1]);
    }
  }
  return codigos;
}

// ===========================================================================
// 3. Lectura y consolidación del CSV
// ===========================================================================

const csvText = readFileSync(CSV_PATH, 'utf8');
const filas = parseCsv(csvText);
const encabezado = filas[0].map((h) => h.trim());
const renglones = filas.slice(1).map((r) => {
  const o = {};
  encabezado.forEach((h, i) => (o[h] = (r[i] ?? '').trim()));
  return o;
});

const catalogo = codigosDelCatalogo();

// Agrupa por código: la planilla trae 9 códigos duplicados (§4.2 del
// documento de la carga). Los duplicados con el mismo insumo de catálogo se
// consolidan sumando cantidades — es la lectura menos arriesgada de "probable
// error de carga o compras repetidas del mismo insumo", y la que el propio
// documento sugiere para los casos idénticos. No se intenta separar los casos
// donde dos proveedores distintos aparecen bajo el mismo código (ej. 136PRE):
// ambos renglones apuntan al mismo codigo_interno de catálogo, así que
// consolidan en el mismo lote de apertura por diseño, no por descuido.
const porCodigo = new Map();
for (const r of renglones) {
  const codigo = r.codigo?.trim();
  if (!codigo) continue;
  if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
  porCodigo.get(codigo).push(r);
}

const importables = [];
const excluidosNoCatalogo = [];
const excluidosSinCodigo = [];

for (const [codigo, filasDelCodigo] of porCodigo) {
  if (!catalogo.has(codigo)) {
    excluidosNoCatalogo.push({ codigo, filas: filasDelCodigo });
    continue;
  }

  const cantidades = filasDelCodigo.map((f) => toNumberOrNull(f.contenido_cantidad));
  const algunaDeclarada = cantidades.some((c) => c !== null && c > 0);
  const cantidadTotal = cantidades.reduce((acc, c) => acc + (c ?? 0), 0);
  const cantidadNoDeclarada = !algunaDeclarada;

  const proveedores = [
    ...new Set(filasDelCodigo.map((f) => f.proveedor?.trim()).filter((p) => p)),
  ];
  const loteProveedorTexto =
    proveedores.length > 0
      ? `SALDO DE APERTURA — ${proveedores.join(' / ')}`
      : 'SALDO DE APERTURA — sin proveedor registrado en la planilla de origen';

  const coloresOrigen = [...new Set(filasDelCodigo.map((f) => f.color_origen?.trim()).filter(Boolean))];
  const colorOrigen = coloresOrigen.join('+'); // más de un color en el mismo código: se deja constancia de los dos

  const detalle = filasDelCodigo.map((f) => f.detalle?.trim()).filter(Boolean).join(' / ');

  importables.push({
    codigo,
    cantidad: cantidadNoDeclarada ? 0 : cantidadTotal,
    cantidadNoDeclarada,
    loteProveedorTexto,
    colorOrigen: colorOrigen || null,
    detalle,
    filasOriginales: filasDelCodigo.length,
  });
}

// ===========================================================================
// 4. Reporte de pendientes (para docs/DECISIONES_ABIERTAS.md, no se decide acá)
// ===========================================================================

const familiasExcluidas = new Map();
for (const { codigo, filas: fs } of excluidosNoCatalogo) {
  for (const f of fs) {
    const fam = f.familia?.trim() || '(sin familia)';
    if (!familiasExcluidas.has(fam)) familiasExcluidas.set(fam, []);
    familiasExcluidas.get(fam).push(codigo);
  }
}

let pendientesMd = `# Pendientes de la carga de saldo de apertura\n\n`;
pendientesMd += `Generado por \`scripts/apertura/generar_migracion.mjs\`. No son datos importados: son códigos de\n`;
pendientesMd += `\`inventario_apertura.csv\` que no están en \`gmp.insumos_catalogo\` y que por lo tanto no entraron\n`;
pendientesMd += `en la migración generada. Clasificarlos es una decisión de catálogo (RN de qué tipo de insumo son,\n`;
pendientesMd += `si aplica \`requiere_protocolo\`/\`es_inflamable\`), no de esta carga. Ver CLAUDE.md §7 y\n`;
pendientesMd += `\`docs/DECISIONES_ABIERTAS.md\`.\n\n`;
pendientesMd += `**${excluidosNoCatalogo.length} códigos excluidos**, agrupados por familia declarada en la planilla:\n\n`;
for (const [fam, codigos] of [...familiasExcluidas].sort((a, b) => b[1].length - a[1].length)) {
  pendientesMd += `- **${fam}** (${codigos.length}): ${[...new Set(codigos)].join(', ')}\n`;
}
pendientesMd += `\n## Caso aparte: código \`550\`\n\n`;
pendientesMd += `9 renglones de mobiliario y POP comparten el código \`550\`, que no es un insumo: es una categoría de\n`;
pendientesMd += `activo fijo. Igual que el resto de esta lista, queda fuera de \`gmp.insumos_catalogo\` y de esta carga.\n`;

writeFileSync(PENDIENTES_PATH, pendientesMd, 'utf8');

// ===========================================================================
// 5. Migración SQL
// ===========================================================================

const hashArchivo = origen.hash_archivo;
const hashCsv = createHash('sha256').update(csvText, 'utf8').digest('hex');

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}

const valuesRows = importables
  .map((it) => {
    return `    (${sqlLiteral(it.codigo)}, ${it.cantidad}, ${it.cantidadNoDeclarada}, ${sqlLiteral(
      it.loteProveedorTexto,
    )}, ${sqlLiteral(it.colorOrigen)})`;
  })
  .join(',\n');

const timestamp = '20260922200000';
const outPath = path.join(MIGRATIONS_DIR, `${timestamp}_carga_saldo_apertura.sql`);

const observaciones =
  `${importables.length} de ${renglones.length} renglones de origen importados. El resto ` +
  `(herramientas, mobiliario, merchandising, libros) queda fuera del catálogo de insumos ` +
  `y listado en scripts/apertura/pendientes.md. Origen: ${ARCHIVO_ORIGEN}, sha256 ` +
  `${hashArchivo}. CANTIDAD de la planilla leída como unidades en existencia por ` +
  `indicación de la conducción del proyecto (2026-09-22).`;

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Carga del saldo inicial de apertura (docs/ESPEC_SALDO_INICIAL.md)
--             a partir de la planilla «05 INVENTARIO NAIL SHOW FABRICA»
--             (scripts/apertura/inventario_apertura.csv, ${renglones.length} renglones de origen).
--             Generado por scripts/apertura/generar_migracion.mjs — no editar
--             a mano; si el CSV cambia, se regenera el script y este archivo
--             se reemplaza por uno nuevo (nunca se edita una migración ya
--             aplicada, CLAUDE.md §6).
-- Reglas    : §2, §3 y §4 de docs/ESPEC_SALDO_INICIAL.md. No crea aprobación
--             de calidad ni firma (§7 del mismo documento). RN-50 (auditoría,
--             vía el trigger genérico que ya lleva gmp.lotes_insumo).
-- Fecha     : ${FECHA_CORTE}
-- ---------------------------------------------------------------------------
--
-- ALCANCE: ${importables.length} de los ${renglones.length} renglones del CSV, los que tienen
-- codigo_interno ya cargado en gmp.insumos_catalogo. Los ${excluidosNoCatalogo.length} restantes
-- (herramientas, mobiliario, merchandising, libros — ninguno es insumo GMP con
-- tipo_insumo_enum asignable sin que la Gerencia lo confirme) quedan listados
-- en scripts/apertura/pendientes.md y fuera de esta carga: clasificarlos es
-- tarea de catálogo, no de saldo inicial.
--
-- CONSOLIDACIÓN DE CÓDIGOS DUPLICADOS (§4.2 del documento de la carga): los
-- códigos que la planilla repite se suman en un solo renglón por
-- codigo_interno, con \`lote_proveedor\` listando todos los proveedores de
-- origen y \`color_origen\` concatenando los colores si difieren entre filas.
--
-- SIN CANTIDAD DECLARADA: se carga con cantidad 0 y \`cantidad_no_declarada =
-- true\`. Estos renglones generan el lote (con su metadato) pero NINGÚN
-- movimiento de stock: \`comercial.movimientos_stock\` exige \`cantidad <> 0\`,
-- y un movimiento de cero no es un movimiento. \`comercial.cargar_apertura_a_stock()\`
-- (migración …150000) los salta a propósito.

do $$
declare
  v_migracion_id uuid;
  v_ejecutada_por uuid;
  v_ya_cargado integer;
begin
  -- CANDADO CONTRA DOBLE CARGA.
  -- El stock es un libro de movimientos: cargar dos veces no pisa el saldo,
  -- lo duplica, y la corrección sería un movimiento inverso por cada renglón
  -- (invariante 8, RN-54). Si ya hay una carga de apertura asentada, esta se
  -- detiene. No es paranoia: hubo una migración de carga anterior que se
  -- escribió, no se aplicó, y se reemplazó por ésta; si aquélla hubiera
  -- llegado a correr en algún entorno, esto lo detecta.
  select count(*) into v_ya_cargado from gmp.migracion_apertura;
  if v_ya_cargado > 0 then
    raise exception
      'Ya hay % carga(s) de saldo de apertura asentada(s) en gmp.migracion_apertura. '
      'Una segunda carga duplicaría el stock en vez de corregirlo. Si el saldo cambió, '
      'corresponde un ajuste de inventario, no otra apertura.', v_ya_cargado
      using errcode = 'check_violation';
  end if;

  -- La carga la asienta la Dirección Técnica titular: es la autoridad
  -- regulatoria responsable de que un dato migrado sin circuito de calidad
  -- entre al sistema (§2 de docs/ESPEC_SALDO_INICIAL.md).
  --
  -- CAMBIO DEL 2026-09-23, antes de aplicarse: la titular no tiene cuenta en el
  -- sistema. Por decisión del codirector técnico, la carga la asienta la
  -- Dirección Técnica activa: la titular si está, y si no la DT suplente
  -- (salta.agustin@gmail.com, promovida por 20260922190000). Sigue sin
  -- asentarse a nombre de cualquiera: si no hay ninguna de las dos, se detiene.
  select id into v_ejecutada_por
    from core.usuarios
   where rol = 'DIRECCION_TECNICA' and activo
     and (es_dt_titular or email = 'salta.agustin@gmail.com')
   order by es_dt_titular desc
   limit 1;
  if v_ejecutada_por is null then
    raise exception
      'No hay Dirección Técnica activa (titular ni suplente) en core.usuarios. '
      'La carga de saldo de apertura necesita un responsable regulatorio identificado antes de asentarse.'
      using errcode = 'check_violation';
  end if;

  -- \`supabase db push\` corre esta migración como el rol de conexión de la
  -- CLI, sin sesión de PostgREST detrás: \`request.jwt.claims\` no existe, y
  -- \`core.usuario_actual()\` (el DEFAULT de \`registrado_por\` en
  -- gmp.lotes_insumo y en comercial.movimientos_stock) devolvería NULL contra
  -- columnas NOT NULL. Se fija el claim, acotado a esta transacción
  -- (\`set_config(..., true)\`), a nombre de la misma Dirección Técnica
  -- titular que asienta la migración: es información real —quien queda
  -- registrado como autor es quien de hecho autoriza la carga— y no un valor
  -- inventado para pasar la restricción.
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_ejecutada_por::text, 'rol', 'DIRECCION_TECNICA')::text,
    true
  );

  insert into gmp.migracion_apertura (fecha_corte, archivo_origen, hash_archivo, ejecutada_por, observaciones)
  values (
    ${sqlLiteral(FECHA_CORTE)},
    ${sqlLiteral(ARCHIVO_ORIGEN)},
    ${sqlLiteral(hashArchivo)},
    v_ejecutada_por,
    ${sqlLiteral(observaciones)}
  )
  returning id into v_migracion_id;

  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id,
    cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, color_origen, unidad
  )
  select
    i.id,
    'SALDO_APERTURA',
    v_migracion_id,
    d.cantidad,
    d.cantidad_no_declarada,
    d.lote_proveedor,
    d.color_origen,
    coalesce(i.unidad_medida, 'PENDIENTE')
  from (
    values
${valuesRows}
  ) as d(codigo, cantidad, cantidad_no_declarada, lote_proveedor, color_origen)
  join gmp.insumos_catalogo i on i.codigo_interno = d.codigo;

  -- Los movimientos de stock son un paso administrativo aparte y deliberado,
  -- igual que la carga de una recepción (comercial.cargar_recepcion_a_stock):
  -- separa "el dato ya está en el sistema" de "el stock ya se puede descontar".
  perform comercial.cargar_apertura_a_stock(v_migracion_id);
end;
$$;
`;

writeFileSync(outPath, sql, 'utf8');

console.log(`Migración generada: ${path.relative(REPO_ROOT, outPath)}`);
console.log(`  Renglones de origen: ${renglones.length}`);
console.log(`  Importados (código en catálogo): ${importables.length}`);
console.log(`  Sin cantidad declarada: ${importables.filter((i) => i.cantidadNoDeclarada).length}`);
console.log(`  Excluidos (código fuera de catálogo): ${excluidosNoCatalogo.length} → scripts/apertura/pendientes.md`);
