#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Genera la carga de proveedores del listado unificado (NAIL + PRUEBA +
// ATHENE, 16/10/2026) a gmp.proveedores.
//
// Lee el xlsx con SheetJS ya copiado en el repo
// (supabase/functions/_shared/vendor): no suma dependencias.
//
// Uso:
//   node scripts/proveedores/generar_migracion.mjs <Proveedores_unificado.xlsx> <salida.sql>
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const XLSX = await import(
  pathToFileURL(path.join(RAIZ, 'supabase/functions/_shared/vendor/xlsx-0.20.3.mjs')).href
);

const [archivo, salida] = process.argv.slice(2);
if (!archivo || !salida) {
  console.error('Uso: generar_migracion.mjs <Proveedores_unificado.xlsx> <salida.sql>');
  process.exit(1);
}

const buf = readFileSync(archivo);
const sha = createHash('sha256').update(buf).digest('hex');
const wb = XLSX.read(buf);
const hoja = (n) =>
  XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }).slice(1);

const txt = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const sql = (v) => (v ? `'${v.replace(/'/g, "''")}'` : 'null');
const notas = (...partes) => partes.filter(Boolean).join(' · ') || null;

const filas = [];
for (const f of hoja('Proveedores')) {
  const [
    razon,
    cuitBruto,
    domicilio,
    telefono,
    email,
    web,
    enSistema,
    origen,
    fuente,
    obs,
  ] = f.map(txt);
  if (!razon) continue;
  const digitos = cuitBruto.replace(/\D/g, '');
  const cuit = digitos.length === 11 ? digitos : null;
  filas.push({
    razon,
    enSistema,
    cuit,
    domicilio,
    telefono,
    email,
    obs: notas(
      enSistema && enSistema.toUpperCase() !== razon.toUpperCase()
        ? `En el sistema anterior: ${enSistema}`
        : null,
      origen ? `Listados: ${origen}` : null,
      web ? `Web: ${web}` : null,
      fuente ? `Fuente: ${fuente}` : null,
      digitos && !cuit ? `CUIT del listado incompleto: ${cuitBruto}` : null,
      obs,
    ),
  });
}
for (const f of hoja('Sin CUIT - internos')) {
  const [nombre, documento, condicion, origen, obs] = f.map(txt);
  if (!nombre) continue;
  filas.push({
    razon: nombre,
    enSistema: nombre,
    cuit: null,
    domicilio: '',
    telefono: '',
    email: '',
    obs: notas(
      'Cuenta interna sin CUIT (gasto, préstamo, personal o genérica)',
      condicion ? `Condición fiscal: ${condicion}` : null,
      documento ? `Documento: ${documento}` : null,
      origen ? `Listados: ${origen}` : null,
      obs,
    ),
  });
}

const valores = filas
  .map(
    (r) =>
      `  (${sql(r.razon)}, ${sql(r.enSistema)}, ${sql(r.cuit)}, ${sql(r.domicilio)}, ${sql(r.telefono)}, ${sql(r.email)}, ${sql(r.obs)})`,
  )
  .join(',\n');

writeFileSync(
  salida,
  `-- ---------------------------------------------------------------------------
-- Propósito : Cargar los proveedores del listado unificado (NAIL, PRUEBA y
--             ATHENE, deduplicados por CUIT) para Administración: ${filas.length}
--             cuentas, con domicilio, teléfono, correo y lo que traía el
--             listado en observaciones.
-- Reglas    : §4.2 (maestro de proveedores), RN-50 (cada alta queda auditada a
--             nombre de quien pidió la carga). Entran PENDIENTES: aprobar un
--             proveedor sigue siendo de Dirección Técnica (§3.3). Pedido del
--             codirector técnico del 2026-10-23.
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/proveedores/generar_migracion.mjs. No editar a mano:
-- regenerar desde la planilla.
--
-- Archivo de origen: Proveedores_unificado(2).xlsx, hojas «Proveedores» y
-- «Sin CUIT - internos»
-- sha256: ${sha}
--
-- LOS QUE YA ESTABAN. Un proveedor ya cargado (por CUIT, por razón social o
-- por el nombre que tenía en el sistema anterior) no se duplica: se le
-- completa lo que le falta (CUIT, domicilio, teléfono, correo, observaciones)
-- sin pisar nada, y conserva su aprobación. El resto se da de alta.
-- Idempotente: correrla otra vez no cambia nada.

do $$
declare
  v_autor uuid;
begin
  select id into v_autor
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and activo;
  if v_autor is null then
    raise exception 'No está activa la cuenta del codirector técnico (salta.agustin@gmail.com), que pidió la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_autor::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  create temp table _listado on commit drop as
  select * from (values
${valores}
  ) as x (razon, en_sistema, cuit, domicilio, telefono, email, obs);

  -- El que ya está: se completa, no se duplica.
  update gmp.proveedores p
     set cuit              = coalesce(p.cuit, x.cuit),
         domicilio         = coalesce(p.domicilio, x.domicilio),
         contacto_telefono = coalesce(p.contacto_telefono, x.telefono),
         contacto_email    = coalesce(p.contacto_email, x.email),
         observaciones     = coalesce(p.observaciones, x.obs)
    from _listado x
   where (p.cuit is not null and p.cuit = x.cuit)
      or upper(btrim(p.razon_social)) in (upper(btrim(x.razon)), upper(btrim(coalesce(x.en_sistema, ''))));

  insert into gmp.proveedores
    (razon_social, cuit, domicilio, contacto_telefono, contacto_email, observaciones)
  select x.razon, x.cuit, x.domicilio, x.telefono, x.email, x.obs
    from _listado x
   where not exists (
     select 1 from gmp.proveedores p
      where (x.cuit is not null and p.cuit = x.cuit)
         or upper(btrim(p.razon_social)) in (upper(btrim(x.razon)), upper(btrim(coalesce(x.en_sistema, '')))));
end;
$$;
`,
);
console.log(`${filas.length} proveedores → ${salida}`);
