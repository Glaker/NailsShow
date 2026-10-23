import { useState } from 'react';
import {
  Alert,
  Group,
  Modal,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useProductos } from '@/lib/consultas';
import { useDesgloseProducto } from '@/lib/consultasCostos';
import {
  diasRecomendados,
  horasMinutos,
  minutosReloj,
  minutosTrabajo,
  tiempoDe,
} from '@/lib/envasado';
import { etiquetaUnidad, numero } from '@/lib/formato';

const pesos = (n: number) => `$ ${numero(n, 2)}`;

/**
 * «Calcular producción» (pedido del 2026-10-22): para N unidades de un
 * producto, qué insumos hacen falta, cuánto tiempo lleva envasarlo y cuánto
 * cuesta, aproximado. Multiplica el desglose de comercial.costo_producto (por
 * unidad, merma incluida) y el tiempo de envasado del producto.
 */
export function CalcularProduccion({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const productos = useProductos();
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | string>(1000);
  const desglose = useDesgloseProducto(productoId);
  const n = Number(cantidad) || 0;
  const producto = (productos.data ?? []).find((p) => p.id === productoId);
  const tiempo = tiempoDe(producto);
  const filas = desglose.data ?? [];
  const insumos = filas.filter((f) => f.tipo !== 'MANO_DE_OBRA');
  const total = filas.reduce((s, f) => s + (f.subtotal ?? 0), 0) * n;
  const faltan = filas.filter((f) => f.falta);

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={<Text fw={700}>Calcular producción</Text>}
      size="xl"
    >
      <Stack gap="md">
        <Group grow align="flex-start">
          <Select
            label="Producto"
            searchable
            nothingFoundMessage="Sin coincidencias"
            data={(productos.data ?? [])
              .filter((p) => p.activo)
              .map((p) => ({ value: p.id, label: `${p.codigo_interno} — ${p.nombre}` }))}
            value={productoId}
            onChange={setProductoId}
            size="md"
          />
          <NumberInput
            label="Cantidad"
            suffix=" unidades"
            min={1}
            allowDecimal={false}
            thousandSeparator="."
            decimalSeparator=","
            value={cantidad}
            onChange={setCantidad}
            size="md"
          />
        </Group>

        {!productoId || n <= 0 ? (
          <Text size="sm" c="dimmed">
            Elegí un producto y cuántas unidades.
          </Text>
        ) : desglose.isLoading ? (
          <Skeleton h={160} />
        ) : (
          <>
            <Group gap="xl" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  Costo total aproximado
                </Text>
                <Text fz={24} fw={800}>
                  {pesos(total)}
                </Text>
                <Text size="xs" c="dimmed">
                  {pesos(n ? total / n : 0)} por unidad
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  Tiempo de envasado
                </Text>
                {tiempo ? (
                  <>
                    <Text fz={24} fw={800}>
                      {diasRecomendados(minutosReloj(n, tiempo))}{' '}
                      {diasRecomendados(minutosReloj(n, tiempo)) === 1 ? 'día' : 'días'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {horasMinutos(minutosTrabajo(n, tiempo))} de trabajo
                      {tiempo.personas > 1
                        ? ` · ${tiempo.personas} personas, ${horasMinutos(minutosReloj(n, tiempo))} cada una`
                        : ''}{' '}
                      · margen de seguridad {numero(tiempo.margenPct)} %
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    Sin tiempo de envasado cargado (Catálogos › Productos).
                  </Text>
                )}
              </div>
            </Group>

            {faltan.length > 0 ? (
              <Alert color="estadoCuarentena" variant="light">
                El costo no está completo: falta{' '}
                {faltan.map((f) => f.componente).join(', ')}.
              </Alert>
            ) : null}

            {insumos.length === 0 ? (
              <Text size="sm" c="dimmed">
                Este producto no tiene fórmula ni materiales cargados: no se sabe qué
                insumos lleva.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="xs" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Insumo necesario</Table.Th>
                      <Table.Th ta="right">Cantidad</Table.Th>
                      <Table.Th ta="right">Costo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {insumos.map((f) => (
                      <Table.Tr key={`${f.orden}-${f.componente}`}>
                        <Table.Td>
                          <Text size="sm">{f.componente}</Text>
                          {f.codigo_interno ? (
                            <Text size="xs" c="dimmed" ff="monospace">
                              {f.codigo_interno}
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {f.cantidad === null
                            ? '—'
                            : `${numero(f.cantidad * (1 + (f.merma ?? 0)) * n, 3)} ${etiquetaUnidad(f.unidad ?? '')}`}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {f.subtotal === null ? '—' : pesos(f.subtotal * n)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
