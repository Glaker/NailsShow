import { Badge } from '@mantine/core';
import type { EstadoDocumento } from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';

/**
 * Color del badge de estado de una fórmula de fabricación (§4.6).
 *
 * Reutiliza los tonos de estado ya usados para semáforos de negocio en otras
 * pantallas (p. ej. «Retenido»/«Despachable» en stock): no son los cuatro
 * colores reservados de rótulo de I.20.2 aplicados a un rótulo, sino el mismo
 * criterio bueno/atención/malo aplicado al ciclo de vida del documento
 * controlado. Sin esto, elegir un borrador a medio cargar pensando que es la
 * fórmula oficial es un error de un click.
 *
 * Un solo lugar para el mapeo: la calculadora de lote y la pantalla de carga
 * de fórmulas tienen que mostrar el mismo color para el mismo estado.
 */
export const COLOR_ESTADO_FORMULA: Record<EstadoDocumento, string> = {
  EN_DESARROLLO: 'estadoEnAnalisis',
  BORRADOR: 'estadoEnAnalisis',
  LISTO_PARA_EMITIR: 'estadoEnAnalisis',
  VIGENTE: 'estadoAprobado',
  EN_REVISION: 'estadoEnAnalisis',
  DADO_DE_BAJA: 'estadoRechazado',
};

export function BadgeEstadoFormula({ estado }: { estado: EstadoDocumento }) {
  return (
    <Badge size="sm" variant="light" radius="sm" color={COLOR_ESTADO_FORMULA[estado]}>
      {etiquetaEnum(estado)}
    </Badge>
  );
}
