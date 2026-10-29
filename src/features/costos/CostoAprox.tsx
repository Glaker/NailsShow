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
 * Costo aproximado de un insumo, opcional (D-costo-estimado-1). Si ya tiene
 * costo de Finanzas o de una compra, solo lo muestra: un estimado no lo pisa.
 * Se carga como se compra: «$ 85.000 por 20 l».
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
  const firme = ref?.costo_unitario_ars != null && ref.origen !== 'ESTIMADO';

  if (firme || (ref?.origen === 'ESTIMADO' && !abierto)) {
    return (
      <Group gap="xs" pl={sangria}>
        <Text size="xs" c="dimmed">
          {firme ? 'Costo' : 'Costo aprox.'}: $ {numero(ref.costo_unitario_ars, 2)} por{' '}
          {etiquetaUnidad(ref.unidad_medida ?? 'UNIDAD')}
          {firme ? ` (${ORIGEN_PRECIO[ref.origen ?? '']?.label ?? ''})` : ''}
        </Text>
        {!firme ? (
          <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
            Cambiar
          </Button>
        ) : null}
      </Group>
    );
  }
  if (!abierto) {
    return (
      <Group pl={sangria}>
        <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
          + Costo aproximado (opcional)
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
