import { useState } from 'react';
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  useActualizarFormula,
  useDensidadEstimadaFormula,
  useFormulasFabricacion,
  useProductos,
} from '@/lib/consultas';
import {
  UNIDADES_GRANEL,
  aContenido,
  useCargarContenidoNeto,
  type UnidadGranel,
} from '@/lib/consultasCostos';
import { numero } from '@/lib/formato';

/**
 * Cuánto granel lleva cada unidad (pedido del 2026-10-27), tenga fórmula
 * propia o se compre el granel. La fórmula está en % p/p: si se carga en
 * volumen hace falta la densidad del granel, y si la fórmula no tiene una
 * medida ni el sistema la puede estimar, se la pide acá (calcular_lote).
 */
export function GranelPorUnidad({ productoId }: { productoId: string }) {
  const productos = useProductos();
  const formulas = useFormulasFabricacion();
  if (productos.isLoading || formulas.isLoading) return <Skeleton h={90} />;
  const producto = (productos.data ?? []).find((p) => p.id === productoId);
  // La misma que usa el costeo: la vigente primero (useFormulasFabricacion ordena así).
  const formula = (formulas.data ?? []).find(
    (f) => f.producto_id === productoId && f.estado !== 'DADO_DE_BAJA',
  );
  return (
    <Formulario
      key={productoId}
      productoId={productoId}
      producto={producto}
      formula={formula}
    />
  );
}

function Formulario({
  productoId,
  producto,
  formula,
}: {
  productoId: string;
  producto:
    { contenido_neto: number | null; unidad_contenido: string | null } | undefined;
  formula:
    | { id: string; densidad_producto: number | null; base_porcentaje: 'PP' | 'VV' }
    | undefined;
}) {
  const guardar = useCargarContenidoNeto();
  const actualizarFormula = useActualizarFormula();
  const enVV = formula?.base_porcentaje === 'VV';
  // El modelo de mezcla lee los % como masa: para una V/V no vale.
  const estimada = useDensidadEstimadaFormula(
    formula && !enVV && formula.densidad_producto == null ? formula.id : undefined,
  );

  const [cantidad, setCantidad] = useState<number | string>(
    producto?.contenido_neto ?? '',
  );
  const [unidad, setUnidad] = useState<UnidadGranel>(
    producto?.unidad_contenido === 'mL' ? 'ml' : 'g',
  );
  const [densidad, setDensidad] = useState<number | string>('');

  const enVolumen = unidad === 'L' || unidad === 'ml';
  // P/P se calcula en masa y V/V en volumen: la densidad hace falta al cruzar.
  const cruza = enVV ? !enVolumen : enVolumen;
  const densidadConocida =
    formula?.densidad_producto ?? estimada.data?.densidad_real ?? null;
  const pideDensidad = cruza && formula != null && densidadConocida == null;
  const listo =
    typeof cantidad === 'number' &&
    cantidad > 0 &&
    (!pideDensidad || (typeof densidad === 'number' && densidad > 0));

  const enviar = async () => {
    if (pideDensidad && formula)
      await actualizarFormula.mutateAsync({
        id: formula.id,
        cambios: { densidad_producto: Number(densidad), densidad_temp_c: 20 },
      });
    guardar.mutate({ producto_id: productoId, ...aContenido(Number(cantidad), unidad) });
  };

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Stack gap="xs">
        {producto?.contenido_neto ? (
          <Text size="sm">
            Lleva{' '}
            <b>
              {numero(producto.contenido_neto, 3)} {producto.unidad_contenido}
            </b>{' '}
            de granel por unidad.
          </Text>
        ) : (
          <Text size="sm">¿Cuánto granel lleva cada unidad?</Text>
        )}
        <Group gap="xs" align="flex-end" wrap="wrap">
          <NumberInput
            label="Cantidad"
            w={140}
            min={0}
            decimalSeparator=","
            value={cantidad}
            onChange={setCantidad}
            size="md"
          />
          <Select
            label="Unidad"
            w={100}
            data={UNIDADES_GRANEL.map((u) => u.value)}
            value={unidad}
            onChange={(u) => u && setUnidad(u as UnidadGranel)}
            allowDeselect={false}
            size="md"
          />
          {pideDensidad ? (
            <NumberInput
              label="Densidad del granel (g/ml)"
              description={`La fórmula no la tiene: hace falta para pasar a ${enVV ? 'litros' : 'kg'}.`}
              w={220}
              min={0}
              decimalSeparator=","
              decimalScale={4}
              value={densidad}
              onChange={setDensidad}
              size="md"
            />
          ) : null}
          <Button
            size="md"
            disabled={!listo}
            loading={guardar.isPending || actualizarFormula.isPending}
            onClick={() => void enviar()}
          >
            Guardar
          </Button>
        </Group>
        {cruza && densidadConocida != null ? (
          <Text size="xs" c="dimmed">
            Densidad del granel: {numero(densidadConocida, 3)} g/ml
            {formula?.densidad_producto == null ? ' (estimada por la fórmula)' : ''}.
          </Text>
        ) : enVolumen && formula == null ? (
          <Text size="xs" c="dimmed">
            Cuando tenga fórmula o granel comprado, si falta la densidad te la pide acá.
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
