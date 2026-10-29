import { useState } from 'react';
import { Button, Group, NumberInput, Select, Text } from '@mantine/core';
import {
  UNIDADES_COSTO,
  useCargarCostoEstimado,
  useCostosReferencia,
} from '@/lib/consultasCostos';
import { etiquetaUnidad, numero } from '@/lib/formato';
import { ORIGEN_PRECIO } from './comun';

/**
 * Costo de un insumo que carga Gerencia de Producción, como se compra:
 * «$ 85.000 por 20 l». Es el que manda sobre Finanzas y las compras, y se
 * cambia cuando haga falta: vale el último (D-costo-naza-1, 20261029140000).
 */
export function CostoAprox({
  insumoId,
  unidad,
  sangria = 0,
}: {
  insumoId: string;
  unidad: string | null;
  sangria?: number;
}) {
  const referencias = useCostosReferencia();
  const cargar = useCargarCostoEstimado();
  const [abierto, setAbierto] = useState(false);
  const [importe, setImporte] = useState<number | string>('');
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [unidadCompra, setUnidadCompra] = useState<string>(
    unidad && UNIDADES_COSTO.includes(unidad) ? unidad : 'UNIDAD',
  );
  const ref = (referencias.data ?? []).find((r) => r.insumo_id === insumoId);
  if (ref?.costo_unitario_ars != null && !abierto) {
    return (
      <Group gap="xs" pl={sangria}>
        <Text size="xs" c="dimmed">
          Costo: $ {numero(ref.costo_unitario_ars, 2)} por{' '}
          {etiquetaUnidad(ref.unidad_medida ?? 'UNIDAD')}
          {ref.origen !== 'ESTIMADO'
            ? ` (${ORIGEN_PRECIO[ref.origen ?? '']?.label ?? ''})`
            : ''}
        </Text>
        <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
          Cambiar
        </Button>
      </Group>
    );
  }
  if (!abierto) {
    return (
      <Group pl={sangria}>
        <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
          + Costo
        </Button>
      </Group>
    );
  }
  const listo =
    typeof importe === 'number' &&
    importe > 0 &&
    typeof cantidad === 'number' &&
    cantidad > 0;
  return (
    <Group gap="xs" pl={sangria} wrap="wrap" align="flex-end">
      <NumberInput
        label="Sale $"
        w={140}
        min={0}
        thousandSeparator="."
        decimalSeparator=","
        value={importe}
        onChange={setImporte}
      />
      <NumberInput
        label="por"
        w={90}
        min={0}
        decimalSeparator=","
        value={cantidad}
        onChange={setCantidad}
      />
      <Select
        label=" "
        w={120}
        data={UNIDADES_COSTO.map((u) => ({ value: u, label: etiquetaUnidad(u) }))}
        value={unidadCompra}
        onChange={(u) => u && setUnidadCompra(u)}
        allowDeselect={false}
      />
      <Button
        disabled={!listo}
        loading={cargar.isPending}
        onClick={() =>
          cargar.mutate(
            {
              insumo_id: insumoId,
              importe: Number(importe),
              cantidad: Number(cantidad),
              unidad: unidadCompra,
            },
            { onSuccess: () => setAbierto(false) },
          )
        }
      >
        Guardar
      </Button>
      <Button variant="subtle" color="gray" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
      <Text size="xs" c="dimmed" w="100%">
        Si se compra en kg y el insumo se mide en ml (o al revés), hace falta su densidad
        para pasarlo.
      </Text>
    </Group>
  );
}
