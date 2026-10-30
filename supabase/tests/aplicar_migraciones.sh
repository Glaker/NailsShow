#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Aplica todas las migraciones de supabase/migrations, en orden y cada una en
# su transacción, contra la base que se le indique.
#
#   bash supabase/tests/aplicar_migraciones.sh <url de psql>
#
# Lo usan el CI (contra el Supabase local de `supabase start`) y
# reconstruir.sh (contra un clúster descartable).
#
# Por qué no `supabase db reset`: algunas cargas iniciales firman a nombre de
# cuentas del proyecto alojado, que en una base vacía no existen. Se siembran
# justo antes de la migración que las necesita: las mismas cuentas de arranque
# que supabase/tests/pglite/reconstruir.mjs y scripts/practica/armar_practica.mjs.
# ---------------------------------------------------------------------------
set -euo pipefail

URL="${1:?Uso: aplicar_migraciones.sh <url de psql>}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
p() { psql "$URL" -q -X -v ON_ERROR_STOP=1 "$@"; }

for f in "$RAIZ"/supabase/migrations/*.sql; do
  b="$(basename "$f")"
  case "$b" in
    20260910140000_*)
      p -c "insert into core.usuarios (id, nombre_completo, email, rol, sector, es_dt_titular)
            values ('a5898868-e25d-4123-bcd9-fbe217f6ca19','Cuenta de verificación',
                    'verificacion@nailshow.com.ar','ADMINISTRADOR_SISTEMA','ADMINISTRACION',false)
            on conflict do nothing;" ;;
    20260922190000_*)
      p -c "insert into core.usuarios (nombre_completo, email, rol, sector)
            values ('Suplente DT','salta.agustin@gmail.com','OPERARIO','PRODUCCION')
            on conflict do nothing;" ;;
    20260924120000_*)
      p -c "insert into core.usuarios (nombre_completo, email, rol, sector)
            values ('Mati','corporativo.nailshow@gmail.com','OPERARIO','ADMINISTRACION')
            on conflict do nothing;" ;;
    # Anula a nombre de la cuenta real de Administración: tiene que existir activa.
    20261020120000_*)
      p -c "insert into core.usuarios (nombre_completo, email, rol, sector)
            values ('Administración','nailshowargentina@hotmail.com','ADMINISTRACION','ADMINISTRACION')
            on conflict (email) do nothing;" ;;
    # Corrige la recepción 00003/2026 real: en una base vacía no hay qué corregir.
    20261020130000_*)
      printf '  %-64s omitida (solo producción)\n' "$b"
      continue ;;
    # La carga de Romero cita productos que en la base real se dieron de alta
    # desde la pantalla, sin migración.
    20261030120100_*)
      p -c "insert into gmp.productos (codigo_interno, nombre, vida_util_meses)
            values ('NS-399','Sanitizante PAZ 1L',36), ('NST - 512','NAIL TIPS NATURAL CURVA C X100',36),
                   ('195','REMOVEDOR DE LITRO',36), ('79','VIA LACTEA 45GR',36)
            on conflict (codigo_interno) do nothing;" ;;
  esac
  printf '  %-64s ' "$b"
  p -1 -f "$f" >/dev/null
  echo ok
done
