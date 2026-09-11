#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Levanta un clúster PostgreSQL descartable, reproduce todas las migraciones
# desde cero y deja la base lista para verificar.
#
# Existe porque este proyecto trabaja directo contra el Supabase alojado y no
# tiene `db reset`: sin esto, la única forma de saber si una migración aplica
# es aplicarla en producción. `supabase db reset`, `db diff` y `test db` piden
# Docker, que en esta máquina no hay. `initdb` sí está.
#
# No toca el proyecto alojado. Todo vive en un directorio temporal.
#
#   bash supabase/tests/reconstruir.sh          # levanta y carga
#   bash supabase/tests/verificacion.sh         # corre las pruebas
# ---------------------------------------------------------------------------
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${NAILSHOW_TEST_DIR:-${TMPDIR:-/tmp}/nailshow-verificacion}"
PUERTO="${NAILSHOW_TEST_PORT:-55432}"
export PGPORT="$PUERTO" PGHOST=127.0.0.1 PGUSER="${USER:-postgres}"

command -v initdb >/dev/null || { echo "Falta initdb (paquete postgresql)."; exit 1; }

if pg_ctl -D "$DIR/data" status >/dev/null 2>&1; then
  pg_ctl -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true
fi
rm -rf "$DIR"; mkdir -p "$DIR/data" "$DIR/run"

initdb -D "$DIR/data" -U "$PGUSER" --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR/run -h 127.0.0.1 -p $PUERTO" -l "$DIR/log" start >/dev/null
trap 'true' EXIT

# Roles que Supabase trae de fábrica y que las migraciones nombran.
psql -q -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create role supabase_admin nologin bypassrls;
create role postgres superuser login;
SQL

dropdb --if-exists nailshow; createdb nailshow
psql -q -d nailshow -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/tests/andamio.sql"

for f in "$RAIZ"/supabase/migrations/*.sql; do
  # La carga de proveedores atribuye las filas a una cuenta concreta del
  # proyecto alojado. Acá esa cuenta no existe, así que se siembra antes.
  case "$(basename "$f")" in
    20260910140000_*)
      psql -q -d nailshow -v ON_ERROR_STOP=1 -c "
        insert into core.usuarios (id, nombre_completo, email, rol, sector, es_dt_titular)
        values ('a5898868-e25d-4123-bcd9-fbe217f6ca19','Cuenta de verificación',
                'verificacion@nailshow.com.ar','ADMINISTRADOR_SISTEMA','ADMINISTRACION',true);" ;;
  esac
  printf '  %-60s ' "$(basename "$f")"
  psql -q -d nailshow -v ON_ERROR_STOP=1 -f "$f" >/dev/null && echo "ok"
done

echo
echo "Base de verificación lista en 127.0.0.1:$PUERTO/nailshow"
echo "Para apagarla:  pg_ctl -D $DIR/data stop"
