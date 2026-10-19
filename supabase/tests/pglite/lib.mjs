import { reconstruir } from './reconstruir.mjs';
// Clave de prueba de la emisión ARCA: la misma que siembra andamio.sql en el Vault simulado.
export const CLAVE_ARCA = 'clave-de-prueba-arca-0123456789abcdef';
export async function banco() {
  const db = await reconstruir({ silencioso: true });
  const q = async (s, p) => (await db.query(s, p)).rows;
  const uno = async (s, p) => (await q(s, p))[0];
  const r = { ok: 0, mal: 0 };
  const prueba = async (n, fn) => {
    try {
      await db.exec('savepoint p');
      await fn();
      await db.exec('release savepoint p');
      r.ok++;
      console.log('  ok  ', n);
    } catch (e) {
      await db.exec('rollback to savepoint p').catch(() => {});
      r.mal++;
      console.log('  MAL ', n, '→', e.message);
    }
  };
  const rechaza = async (n, sql, pat, params) =>
    prueba(n, async () => {
      await db.exec('savepoint s');
      try {
        await db.query(sql, params);
        await db.exec('set constraints all immediate');
      } catch (e) {
        await db.exec('rollback to savepoint s');
        if (pat && !pat.test(e.message)) throw new Error('otro: ' + e.message);
        return;
      }
      await db.exec('rollback to savepoint s');
      throw new Error('no rechazó');
    });
  // Sesión como usuario de email dado, con rol dado.
  const como = async (email, rol) => {
    await db.exec(`reset role`);
    if (rol)
      await db.query(`update core.usuarios set rol=$1 where email=$2`, [rol, email]);
    await db.query(
      `select public.sesion((select id from core.usuarios where email=$1))`,
      [email],
    );
    await db.exec(`set role authenticated`);
  };
  const usuario = async (email, rol, sector = 'PRODUCCION') => {
    await db.exec('reset role');
    await db.query(
      `insert into core.usuarios (nombre_completo, email, rol, sector) values ($1,$1,$2,$3) on conflict (email) do update set rol = excluded.rol`,
      [email, rol, sector],
    );
  };
  const invariantes = () =>
    prueba('invariantes', async () => {
      await db.exec('reset role');
      await db.query(
        `select public.sesion((select id from core.usuarios where email='verificacion@nailshow.com.ar'))`,
      );
      const r = await q('select * from core.verificar_invariantes()');
      const malas = r.filter((x) => x.cumple === false);
      if (malas.length) throw new Error(JSON.stringify(malas));
    });
  // Atajo de preparación: deja una orden LIBERADA sin recorrer su circuito
  // (etapas, controles, R.50.10.1), que se prueba en probar_ordenes y
  // probar_atajos. Desde 20261016120000 el trigger exige ese circuito incluso
  // al superusuario, así que el atajo apaga los triggers solo para este UPDATE.
  // Firma quien tenga la sesión (usar después de como(DT)).
  const liberarAtajo = async (orden) => {
    await db.exec('reset role');
    await db.exec('set session_replication_role = replica');
    await db.query(
      `update gmp.ordenes_produccion set estado='LIBERADA',
      terminada_por=core.usuario_actual(), terminada_en=now(),
      liberada_por=core.usuario_actual(), liberada_en=now() where id=$1`,
      [orden],
    );
    await db.exec('set session_replication_role = origin');
  };
  const fin = () => {
    console.log(`\n${r.ok} en verde, ${r.mal} en rojo`);
    process.exit(r.mal ? 1 : 0);
  };
  await db.exec('begin');
  return { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes, liberarAtajo };
}
