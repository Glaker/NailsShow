import { Paper, Skeleton, Stack, Table, Text } from '@mantine/core';
import { fecha, numero } from '@/lib/formato';
import { useTrazabilidadOrden, type FilaTrazabilidad } from '@/lib/consultasOrdenes';

/**
 * Trazabilidad del lote (ítem 12 de la cola del 24/09): hacia atrás, qué lotes
 * de insumo se usaron y de qué proveedor; hacia adelante, a quién se despachó.
 * `impreso` la muestra con las tablas del batch record.
 */
export function TrazabilidadOrden({
  ordenId,
  impreso = false,
}: {
  ordenId: string;
  impreso?: boolean;
}) {
  const traza = useTrazabilidadOrden(ordenId);
  if (traza.isLoading) return impreso ? null : <Skeleton h={120} />;
  const filas = traza.data ?? [];
  const insumos = filas.filter((f) => f.sentido === 'INSUMO');
  const despachos = filas.filter((f) => f.sentido === 'DESPACHO');
  const vacio =
    'Sin registros todavía (se completa con «Terminado» y los despachos del pedido).';

  const tablaInsumos = (f: FilaTrazabilidad[]) => (
    <Table verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Insumo</Table.Th>
          <Table.Th>Lote interno</Table.Th>
          <Table.Th>Lote proveedor</Table.Th>
          <Table.Th>Recepción</Table.Th>
          <Table.Th>Proveedor</Table.Th>
          <Table.Th ta="right">Cantidad</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {f.map((x, i) => (
          <Table.Tr key={i}>
            <Table.Td>{x.articulo}</Table.Td>
            <Table.Td ff="monospace">{x.lote_interno}</Table.Td>
            <Table.Td>{x.lote_proveedor}</Table.Td>
            <Table.Td>{x.recepcion ?? '—'}</Table.Td>
            <Table.Td>{x.contraparte}</Table.Td>
            <Table.Td ta="right">
              {numero(Number(x.cantidad), 3)} {x.unidad}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  const contenido = (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Insumos usados (hacia atrás)
      </Text>
      {insumos.length ? (
        tablaInsumos(insumos)
      ) : (
        <Text size="sm" c="dimmed">
          {vacio}
        </Text>
      )}
      <Text fw={600} size="sm">
        Despachos (hacia adelante)
      </Text>
      {despachos.length ? (
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {despachos.map((x, i) => (
              <Table.Tr key={i}>
                <Table.Td>{fecha(x.momento)}</Table.Td>
                <Table.Td>{x.contraparte}</Table.Td>
                <Table.Td>pedido {x.pedido}</Table.Td>
                <Table.Td>desde {x.recepcion}</Table.Td>
                <Table.Td ta="right">{numero(Number(x.cantidad), 0)} u</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm" c="dimmed">
          {vacio}
        </Text>
      )}
    </Stack>
  );

  return impreso ? (
    contenido
  ) : (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Text fw={600} mb="xs">
        Trazabilidad del lote
      </Text>
      {contenido}
    </Paper>
  );
}
