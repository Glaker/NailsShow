import { Link } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconFileText, IconRosetteDiscountCheck } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import { useOrdenes, type OrdenProduccion } from '@/lib/consultasOrdenes';
import { COLOR_ESTADO_ORDEN } from './etapasOrden';

/**
 * Liberación de lotes de producto terminado (pedido del 2026-10-01): lo que la
 * Dirección Técnica tiene que firmar, sin el resto de la producción. La firma
 * se hace en la orden; desde acá se abre la orden o se baja el batch record.
 */
export function PaginaLiberacion() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const filas = ordenes.data ?? [];
  const pendientes = filas.filter((o) => o.estado === 'TERMINADA');
  const resueltas = filas
    .filter((o) => o.estado === 'LIBERADA' || o.estado === 'RECHAZADA')
    .slice(0, 30);

  const tabla = (lista: OrdenProduccion[], conAccion: boolean) => (
    <Paper
      withBorder
      className="entrada"
      style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
    >
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Lote</Table.Th>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Cantidad</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to={`/ordenes/${o.id}`}
                    fw={700}
                    ff="monospace"
                  >
                    {o.numero_lote}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    Orden {o.numero} · {fecha(o.jornada)}
                  </Text>
                </Table.Td>
                <Table.Td>{nombre(o.producto_id)}</Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {numero(Number(o.cantidad_teorica), 2)} {o.unidad}
                </Table.Td>
                <Table.Td>
                  <Badge color={COLOR_ESTADO_ORDEN[o.estado]} variant="light">
                    {o.estado === 'TERMINADA'
                      ? 'espera liberación'
                      : o.estado.toLowerCase()}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Button
                      component={Link}
                      to={`/ordenes/${o.id}/batch-record`}
                      variant="default"
                      size="sm"
                      leftSection={<IconFileText size={16} />}
                    >
                      Batch record
                    </Button>
                    {conAccion ? (
                      <Button component={Link} to={`/ordenes/${o.id}`} size="sm">
                        Liberar o rechazar
                      </Button>
                    ) : null}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Liberación de lotes"
        descripcion="Producto terminado que espera tu firma, y el batch record de cada lote para descargar."
      />
      {ordenes.isLoading ? (
        <Skeleton h={240} />
      ) : (
        <Stack gap="xl">
          <Stack gap="sm">
            <Title order={3}>Esperan liberación · {pendientes.length}</Title>
            {pendientes.length ? (
              tabla(pendientes, true)
            ) : (
              <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
                <Vacio
                  icono={IconRosetteDiscountCheck}
                  titulo="No hay lotes esperando liberación"
                  descripcion="Cuando producción termine una orden, aparece acá."
                />
              </Paper>
            )}
          </Stack>
          {resueltas.length ? (
            <Stack gap="sm">
              <Title order={3}>Resueltos</Title>
              {tabla(resueltas, false)}
            </Stack>
          ) : null}
        </Stack>
      )}
    </>
  );
}
