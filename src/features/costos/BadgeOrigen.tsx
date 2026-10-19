import { Badge } from '@mantine/core';
import { ORIGEN_PRECIO } from './comun';

/** Badge del origen de un precio (referencia de insumo o componente de producto). */
export function BadgeOrigen({ origen }: { origen: string | null }) {
  if (!origen)
    return (
      <Badge color="gray" variant="light">
        sin costo
      </Badge>
    );
  const o = ORIGEN_PRECIO[origen];
  return (
    <Badge color={o?.color ?? 'gray'} variant="light">
      {o?.label ?? origen}
    </Badge>
  );
}
