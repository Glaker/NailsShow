// Equivalente de supabase/tests/reconstruir.sh sobre PGlite (Postgres en WASM).
// Uso: node reconstruir.mjs [hasta_prefijo] [--dump ruta]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// La raíz del repo, a tres carpetas de acá (supabase/tests/pglite).
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\/]$/, '');
const MIG = `${RAIZ}/supabase/migrations`;

export async function reconstruir({ silencioso = false } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_auth_admin nologin;
    create role supabase_admin nologin bypassrls;
  `);
  try { await db.exec(readFileSync(`${RAIZ}/supabase/tests/andamio.sql`, 'utf8')); } catch (e) { console.log('FALLA andamio', e.message); throw new Error('andamio'); }
  // Borradores opcionales: migraciones en preparación, que se prueban antes de
  // escribirlas en supabase/migrations (una migración escrita no se edita).
  const BOR = new URL('./borradores/', import.meta.url);
  const borradores = existsSync(BOR) ? readdirSync(BOR).filter((x) => x.endsWith('.sql')) : [];
  const todos = [...readdirSync(MIG).filter((x) => x.endsWith('.sql')).map((f) => [f, `${MIG}/${f}`]), ...borradores.map((f) => [f, new URL(f, BOR)])].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [f, ruta] of todos) {
    if (f.startsWith('20260910140000_')) {
      await db.exec(`insert into core.usuarios (id, nombre_completo, email, rol, sector, es_dt_titular)
        values ('a5898868-e25d-4123-bcd9-fbe217f6ca19','Cuenta de verificación',
                'verificacion@nailshow.com.ar','ADMINISTRADOR_SISTEMA','ADMINISTRACION',false);`);
    }
    if (f.startsWith('20260924120000_')) {
      await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector)
        values ('Mati','corporativo.nailshow@gmail.com','OPERARIO','ADMINISTRACION');`);
    }
    if (f.startsWith('20260922190000_')) {
      await db.exec(`insert into core.usuarios (nombre_completo, email, rol, sector)
        values ('Suplente DT','salta.agustin@gmail.com','OPERARIO','PRODUCCION');`);
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
      console.log('FALLA', f, '\n     ', e.message, e.position ? `(pos ${e.position})` : '', e.where ?? '');
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
