import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconPlayerPlay } from '@tabler/icons-react';
import { numero } from '@/lib/formato';
import type { PedidoRow } from '@/lib/consultasComercial';
import {
  useInsumosPedido,
  usePasarAProduccion,
  type Tercero,
} from '@/lib/consultasTercerizados';

type Origen = 'NAILSHOW' | 'TERCERO';
const u = (unidad: string | null) => (unidad === 'UNIDAD' ? 'u' : (unidad ?? ''));

/**
 * Al pasar un pedido tercerizado a producción, el sistema pregunta insumo por
 * insumo si sale del stock de Nail Show o del del cliente (codirector técnico,
 * 2026-09-24). Lo propio del cliente sale siempre de su stock. La elección
 * queda registrada y es la que usa «Terminado».
 */
export function PasarAProduccion({
  pedido,
  tercero,
  onListo,
}: {
  pedido: PedidoRow;
  tercero: Tercero;
  onListo: () => void;
}) {
  const insumos = useInsumosPedido(pedido.id);
  const pasar = usePasarAProduccion();
  const [elegido, setElegido] = useState<Record<string, Origen>>({});

  if (insumos.isLoading) return <Skeleton h={200} />;
  const filas = insumos.data ?? [];
  const origen = (i: (typeof filas)[number]): Origen =>
    i.propio_tercero ? 'TERCERO' : (elegido[i.insumo_id] ?? (i.origen as Origen));
  const noAlcanza = filas.filter((i) => {
    const disp = origen(i) === 'TERCERO' ? i.disponible_tercero : i.disponible_nailshow;
    return Number(disp) < Number(i.necesario);
  });

  return (
    <Stack gap="md">
      <Text size="sm">
        Elegí de dónde sale cada insumo. Viene marcado lo sugerido: del stock de{' '}
        {tercero.nombre} si tiene, si no de Nail Show. Lo que es propio del cliente sale
        siempre de su stock.
      </Text>

      {filas.length === 0 ? (
        <Alert color="gray" variant="light" radius="md">
          Los productos de este pedido no tienen cargado qué llevan: no hay insumos que
          elegir.
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th ta="right">Hace falta</Table.Th>
                <Table.Th ta="right">Nail Show tiene</Table.Th>
                <Table.Th ta="right">{tercero.nombre} tiene</Table.Th>
                <Table.Th>Sale de</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((i) => {
                const o = origen(i);
                const disp =
                  o === 'TERCERO' ? i.disponible_tercero : i.disponible_nailshow;
                const falta = Number(disp) < Number(i.necesario);
                return (
                  <Table.Tr key={i.insumo_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {i.insumo}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {i.codigo_interno}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" fw={600}>
                        {numero(Number(i.necesario), 2)} {u(i.unidad)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text
                        size="sm"
                        ff="monospace"
                        c={i.propio_tercero ? 'dimmed' : 'inherit'}
                      >
                        {i.propio_tercero
                          ? '—'
                          : numero(Number(i.disponible_nailshow), 2)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {numero(Number(i.disponible_tercero), 2)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {i.propio_tercero ? (
                        <Badge color="indigo" variant="light" radius="sm">
                          {tercero.nombre} (propio)
                        </Badge>
                      ) : (
                        <SegmentedControl
                          size="sm"
                          value={o}
                          onChange={(v) =>
                            setElegido({ ...elegido, [i.insumo_id]: v as Origen })
                          }
                          data={[
                            { value: 'NAILSHOW', label: 'Nail Show' },
                            { value: 'TERCERO', label: tercero.nombre },
                          ]}
                        />
                      )}
                      {falta ? (
                        <Text size="xs" c="estadoRechazado.8" mt={4}>
                          No alcanza el stock aprobado
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {noAlcanza.length > 0 ? (
        <Alert
          color="estadoCuarentena"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
        >
          {noAlcanza.length === 1
            ? 'Un insumo no alcanza'
            : `${noAlcanza.length} insumos no alcanzan`}{' '}
          en el stock elegido. Se puede pasar a producción igual, pero «Terminado» no va a
          poder descontar hasta que llegue y lo apruebe Calidad.
        </Alert>
      ) : null}

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Volver
        </Button>
        <Button
          size="md"
          leftSection={<IconPlayerPlay size={18} />}
          loading={pasar.isPending}
          onClick={() =>
            pasar.mutate(
              {
                pedidoId: pedido.id,
                origenes: filas
                  .filter((i) => !i.propio_tercero)
                  .map((i) => ({ insumo_id: i.insumo_id, origen: origen(i) })),
              },
              { onSuccess: onListo },
            )
          }
        >
          Pasar a producción
        </Button>
      </Group>
    </Stack>
  );
}
