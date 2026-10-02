#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Arma la base de PRÁCTICA (pedido del 2026-10-02): un proyecto Supabase
// aparte, para que Administración practique con datos inventados sin tocar
// la base real ni facturar.
//
//   node scripts/practica/armar_practica.mjs <ref-del-proyecto-de-práctica>
//
// Qué hace, en este orden, contra ESE proyecto y ningún otro:
//   1. Aplica las migraciones de supabase/migrations que le falten (lleva la
//      cuenta en supabase_migrations.schema_migrations, como la CLI), con las
//      mismas cuentas de arranque que la reconstrucción de PGlite.
//   2. Enciende el hook de JWT (core.custom_access_token_hook).
//   3. Carga los datos inventados (scripts/practica/datos_practica.sql; si ya
//      están, no hace nada).
//   4. Muestra la URL y la clave pública para el despliegue de práctica.
//
// No usa `supabase link`: el repositorio sigue vinculado a la base real y un
// `db push` común sigue yendo a la real. Usa la Management API con
// SUPABASE_ACCESS_TOKEN. No despliega la función de facturación ni carga
// certificados: en práctica no se factura.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL = 'yxpzsxkefqfuhyvslkfw';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const ref = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!ref || !/^[a-z]{20}$/.test(ref)) {
  console.error(
    'Uso: node scripts/practica/armar_practica.mjs <ref-del-proyecto-de-práctica>',
  );
  process.exit(1);
}
if (ref === REAL) {
  console.error(
    'ALTO: ese es el proyecto REAL de Nail Show. Este script es solo para la base de práctica.',
  );
  process.exit(1);
}
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}

const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
};
const sql = (query) => api('POST', '/database/query', { query });

// 0. Que exista y que no sea la real (por nombre también).
const proyecto = await api('GET', '');
console.log(`Proyecto: ${proyecto.name} (${proyecto.ref}, ${proyecto.region})`);
if (!/practica/i.test(proyecto.name)) {
  console.error('ALTO: el proyecto no se llama «…practica…». Por las dudas no sigo.');
  process.exit(1);
}

// 1. Migraciones.
await sql(`create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
const hechas = new Set(
  (await sql('select version from supabase_migrations.schema_migrations')).map(
    (x) => x.version,
  ),
);
const MIG = path.join(RAIZ, 'supabase/migrations');
const archivos = readdirSync(MIG)
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .sort();
// Las mismas cuentas de arranque que supabase/tests/pglite/reconstruir.mjs:
// algunas cargas iniciales firman a nombre de una cuenta que tiene que existir.
const arranque = {
  '20260910140000_': `insert into core.usuarios (id, nombre_completo, email, rol, sector, es_dt_titular)
    values ('a5898868-e25d-4123-bcd9-fbe217f6ca19','Cuenta de verificación','verificacion@nailshow.com.ar','ADMINISTRADOR_SISTEMA','ADMINISTRACION',false)
    on conflict do nothing;`,
  '20260922190000_': `insert into core.usuarios (nombre_completo, email, rol, sector)
    values ('Suplente DT','salta.agustin@gmail.com','OPERARIO','PRODUCCION') on conflict do nothing;`,
  '20260924120000_': `insert into core.usuarios (nombre_completo, email, rol, sector)
    values ('Mati','corporativo.nailshow@gmail.com','OPERARIO','ADMINISTRACION') on conflict do nothing;`,
};
let n = 0;
for (const f of archivos) {
  const version = f.slice(0, 14);
  if (hechas.has(version)) continue;
  const previo = Object.entries(arranque).find(([p]) => f.startsWith(p))?.[1] ?? '';
  const cuerpo = readFileSync(path.join(MIG, f), 'utf8');
  try {
    await sql(
      `begin;\n${previo}\n${cuerpo}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${f.slice(15, -4)}');\ncommit;`,
    );
  } catch (e) {
    console.error(`FALLÓ ${f}:\n${e.message}`);
    process.exit(1);
  }
  n++;
  console.log('ok  ', f);
}
console.log(`${n} migraciones aplicadas (${hechas.size} ya estaban).`);

// 2. Hook de JWT: rol, roles y usuario_id en el token.
await api('PATCH', '/config/auth', {
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: 'pg-functions://postgres/core/custom_access_token_hook',
});
console.log('Hook de JWT encendido.');

// 3. Datos inventados.
await sql(readFileSync(path.join(AQUI, 'datos_practica.sql'), 'utf8'));
console.log('Datos de práctica listos.');

// 4. Lo que va en el despliegue de práctica (la clave es la pública, para el navegador).
const claves = await api('GET', '/api-keys');
const publica =
  claves.find((k) => k.type === 'publishable') ?? claves.find((k) => k.name === 'anon');
console.log('\nPara el despliegue de práctica (Vercel, solo la rama «practica»):');
console.log(`  VITE_SUPABASE_URL=https://${ref}.supabase.co`);
console.log(
  `  VITE_SUPABASE_ANON_KEY=${publica?.api_key ?? '(copiala de Project Settings → API Keys)'}`,
);
console.log('  VITE_MODO_PRACTICA=1');
