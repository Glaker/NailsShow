#!/usr/bin/env bash
#
# Chequeo de fuga de la clave service_role al frontend.
#
# Por qué existe
# --------------
# La clave `service_role` de Supabase tiene BYPASSRLS y no se puede eliminar del
# proyecto (CLAUDE.md §5). Todo el valor probatorio del sistema descansa en que
# cada escritura quede atribuida a un usuario y sujeta a RLS: si esa clave llega
# al bundle del navegador, cualquiera puede escribir salteando toda política, y
# entonces ningún registro prueba nada, porque cualquiera pudo haberlo escrito.
# Un inspector que descubra esa capacidad no cuestiona el registro que está
# mirando: cuestiona la validez del sistema entero (§3.5 del alcance).
#
# Es la invariante 4 de CLAUDE.md §3, y no se negocia.
#
# Qué revisa
# ----------
#  1. El árbol de fuentes `src/`, en TODO tipo de archivo.
#  2. El bundle construido `dist/`, si existe. Este es el chequeo que de verdad
#     cierra el riesgo: es el artefacto que se publica.
#
# Falla si aparece 'service_role' o 'SUPABASE_SERVICE' (sin distinguir
# mayúsculas) fuera de un comentario explicativo marcado con la etiqueta
# `permitido-service-role`.
#
# Salida distinta de cero = falla el build. En CI corre como job propio.

set -euo pipefail

PATRON='service_role|SUPABASE_SERVICE'
ETIQUETA_PERMISO='permitido-service-role'
HUBO_HALLAZGO=0

revisar() {
  local objetivo="$1"
  local etiqueta="$2"

  [ -e "$objetivo" ] || return 0

  local hallazgos
  # -r recursivo, -I ignora binarios, -n número de línea, -E regex extendida.
  # `|| true` porque grep sale con 1 cuando no encuentra nada, que es el caso feliz.
  hallazgos="$(grep -rInE "$PATRON" "$objetivo" 2>/dev/null | grep -v "$ETIQUETA_PERMISO" || true)"

  if [ -n "$hallazgos" ]; then
    echo ""
    echo "FALLA: se encontró una referencia a service_role en ${etiqueta}:"
    echo ""
    echo "$hallazgos" | sed 's/^/    /'
    HUBO_HALLAZGO=1
  else
    echo "  OK  ${etiqueta}: sin referencias a service_role."
  fi
}

echo "Chequeo de fuga de service_role (CLAUDE.md §3 invariante 4, §5)"
echo ""

revisar "src" "el árbol de fuentes src/"

if [ -d "dist" ]; then
  revisar "dist" "el bundle construido dist/"
else
  echo "  --  dist/ no existe todavía; se revisa solo src/."
  echo "      En CI este script corre DESPUÉS de 'npm run build', así que el"
  echo "      bundle publicable siempre queda cubierto."
fi

echo ""

if [ "$HUBO_HALLAZGO" -ne 0 ]; then
  cat <<'AYUDA'
La clave service_role tiene BYPASSRLS: si llega al cliente, toda política RLS
del sistema deja de significar algo y los registros pierden valor probatorio.

Cómo resolverlo:
  - Si necesitás privilegio con un usuario detrás, reenviá el Authorization del
    usuario desde la Edge Function y dejá que corra como 'authenticated'.
  - Si necesitás privilegio SIN usuario detrás (cierre automático de reclamos
    por RN-37, solicitud de CAE), creá un rol de base dedicado sin BYPASSRLS,
    con GRANT EXECUTE solo sobre la función que necesita, y firmá un JWT con
    ese rol. Ver CLAUDE.md §5.
  - Si es una mención en un comentario o documentación, agregá la etiqueta
    'permitido-service-role' en la misma línea.

AYUDA
  exit 1
fi

echo "Sin fugas de service_role."
