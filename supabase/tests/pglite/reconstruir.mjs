// Equivalente de supabase/tests/reconstruir.sh sobre PGlite (Postgres en WASM).
// Uso: node reconstruir.mjs [hasta_prefijo] [--dump ruta]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// La raíz del repo, a tres carpetas de acá (supabase/tests/pglite).
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\/]$/, '');
const MIG = `${RAIZ}/supabase/migrations`;

// Migraciones que corrigen una fila puntual de la base real y fallan a
// propósito si no la encuentran. En una base de prueba esa fila no existe:
// se saltean, y lo que prueban las suites no depende de ellas.
const SOLO_PRODUCCION = new Set([
  '20261020130000_comercial_restituye_recepcion_00003.sql', // la recepción 00003/2026 real
]);

export async function reconstruir({ silencioso = false } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_auth_admin nologin;
    create role supabase_admin nologin bypassrls;
  `);
  try {
    await db.exec(readFileSync(`${RAIZ}/supabase/tests/andamio.sql`, 'utf8'));
  } catch (e) {
    console.log('FALLA andamio', e.message);
    throw new Error('andamio');
  }
  // Borradores opcionales: migraciones en preparación, que se prueban antes de
  // escribirlas en supabase/migrations (una migración escrita no se edita).
  const BOR = new URL('./borradores/', import.meta.url);
  const borradores = existsSync(BOR)
    ? readdirSync(BOR).filter((x) => x.endsWith('.sql'))
    : [];
  const todos = [
    ...readdirSync(MIG)
      .filter((x) => x.endsWith('.sql'))
      .map((f) => [f, `${MIG}/${f}`]),
    ...borradores.map((f) => [f, new URL(f, BOR)]),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [f, ruta] of todos) {
    if (SOLO_PRODUCCION.has(f)) {
      if (!silencioso) console.log('omit ', f, '(corrige datos de la base real)');
      continue;
    }
    if (f.startsWith('20260910140000_')) {
      await db.exec(`insert into core.usuarios (id, nombre_completo, email, rol, sector, es_dt_titular)
        values ('a5898868-e25d-4123-bcd9-fbe217f6ca19','Cuenta de verificación',
                'verificacion@nailshow.com.ar','ADMINISTRADOR_SISTEMA','ADMINISTRACION',false);`);
    }
    if (f.startsWith('20260924120000_')) {
      await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector)
        values ('Mati','corporativo.nailshow@gmail.com','OPERARIO','ADMINISTRACION');`);
    }
    // 20261020120000_comercial_vaciar_stock_viejo anula a nombre de la cuenta
    // real de Administración: tiene que existir activa.
    if (f === '20261020120000_comercial_vaciar_stock_viejo.sql') {
      await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector)
        values ('Administración','nailshowargentina@hotmail.com','ADMINISTRACION','ADMINISTRACION')
        on conflict (email) do nothing;`);
    }
    if (f.startsWith('20260922190000_')) {
      await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector)
        values ('Suplente DT','salta.agustin@gmail.com','OPERARIO','PRODUCCION');`);
    }
    // La carga de Romero cita productos que en la base real se dieron de alta
    // desde la pantalla, sin migración.
    if (f.startsWith('20261030120100_')) {
      await db.exec(`insert into gmp.productos (codigo_interno, nombre, vida_util_meses)
        values ('NS-399','Sanitizante PAZ 1L',36), ('NST - 512','NAIL TIPS NATURAL CURVA C X100',36),
               ('195','REMOVEDOR DE LITRO',36), ('79','VIA LACTEA 45GR',36)
        on conflict (codigo_interno) do nothing;`);
    }
    // psql abre una sesión por archivo; PGlite es una sola. Se reinicia el
    // claim para que ningún archivo herede el de otro.
    // Igual que supabase db push: una sola sesión, sin reiniciar el claim entre
    // archivos. Reiniciarlo escondió el defecto que corrige 20260922205000.
    await db.exec('reset role');
    const sql = readFileSync(ruta, 'utf8');
    try {
      await db.exec(`begin;\n${sql}\ncommit;`);
      if (!silencioso) console.log('ok   ', f);
    } catch (e) {
      await db.exec('rollback;').catch(() => {});
      console.log(
        'FALLA',
        f,
        '\n     ',
        e.message,
        e.position ? `(pos ${e.position})` : '',
        e.where ?? '',
      );
      throw new Error(f);
    }
  }
  return db;
}

if (process.argv[1].endsWith('reconstruir.mjs')) {
  const db = await reconstruir();
  const r = await db.query('select version()');
  console.log(r.rows[0].version);
}
