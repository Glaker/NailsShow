import { Badge, type BadgeProps } from '@mantine/core';
import { COLORES_ESTADO_ROTULO } from '@/app/theme';
import type { Database } from '@/lib/database.types';

type EstadoCalidad = Database['gmp']['Enums']['estado_calidad_enum'];

/**
 * Texto del estado tal como aparece en el rótulo de I.20.2.
 *
 * «EN CUARENTENA» y «EN ANÁLISIS» se escriben así en el registro R.20.2.1; el
 * texto de pantalla y el del rótulo impreso tienen que coincidir, porque el
 * operario compara uno con otro.
 */
export const TEXTO_ESTADO: Record<EstadoCalidad, string> = {
  RECIBIDO: 'Recibido',
  CUARENTENA: 'En cuarentena',
  MUESTREADO: 'Muestreado',
  EN_ANALISIS: 'En análisis',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

interface Props extends Omit<BadgeProps, 'color' | 'children'> {
  estado: EstadoCalidad;
}

/**
 * Insignia de estado de material.
 *
 * El color no se elige acá: sale de `COLORES_ESTADO_ROTULO`, que replica la
 * tabla de I.20.2 que la base aplica en `gmp.color_rotulo()`. Si alguna vez los
 * dos discrepan, manda la base.
 */
export function InsigniaEstado({ estado, ...props }: Props) {
  const color = COLORES_ESTADO_ROTULO[estado];
  /* El amarillo de cuarentena sobre blanco necesita texto oscuro para contrastar. */
  const oscuro = estado === 'CUARENTENA';

  return (
    <Badge
      variant="light"
      color={color}
      radius="sm"
      styles={{
        root: {
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: 0,
          ...(oscuro ? { color: 'var(--mantine-color-estadoCuarentena-9)' } : {}),
        },
      }}
      {...props}
    >
      {TEXTO_ESTADO[estado]}
    </Badge>
  );
}
