import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha, numero } from '@/lib/formato';
import {
  ROLES_RESERVAN,
  useDisponibleNailShow,
  useLiberarReserva,
  useReservar,
  useReservasVigentes,
  useStockTercero,
  useTerceros,
  type Tercero,
} from '@/lib/consultasTercerizados';

const u = (unidad: string | null) => (unidad === 'UNIDAD' ? 'u' : (unidad ?? ''));

/**
 * Reservas vigentes de un stock (de Nail Show si `titular` es null, o de un
 * tercero) y el botón para reservar. Lo reservado para un cliente solo lo usan
 * sus pedidos; al terminarlos, lo consumido descuenta de la reserva.
 */
export function PanelReservas({ titular }: { titular: Tercero | null }) {
  const reservas = useReservasVigentes({ titular: titular?.id ?? null });
  const liberar = useLiberarReserva();
  const puede = useTieneRol(...ROLES_RESERVAN);
  const [abierto, setAbierto] = useState(false);
  const filas = reservas.data ?? [];

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Text fw={600}>Reservas</Text>
            <Text size="xs" c="dimmed">
              Stock apartado para un cliente: los pedidos de los demás no lo cuentan como
              disponible.
            </Text>
          </div>
          {puede ? (
            <Button
              variant="light"
              color="indigo"
              leftSection={<IconLock size={16} />}
              onClick={() => setAbierto(true)}
            >
              Reservar
            </Button>
          ) : null}
        </Group>

        {reservas.isLoading ? (
          <Skeleton h={60} />
        ) : filas.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay reservas vigentes.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th>Para</Table.Th>
                  <Table.Th ta="right">Reservado</Table.Th>
                  <Table.Th ta="right">Queda</Table.Th>
                  <Table.Th>Vence</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {r.insumo_nombre}
                      </Text>
                      {r.motivo ? (
                        <Text size="xs" c="dimmed">
                          {r.motivo}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={r.para_tercero_id ? 'indigo' : 'violeta'}
                        radius="sm"
                      >
                        {r.para_nombre ?? 'Nail Show'}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {numero(Number(r.cantidad), 2)} {u(r.unidad)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" fw={600}>
                        {numero(Number(r.pendiente), 2)} {u(r.unidad)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{r.vence_en ? fecha(r.vence_en) : '—'}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {puede ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconLockOpen size={14} />}
                          loading={liberar.isPending && liberar.variables === r.id}
                          onClick={() =>
                            modals.openConfirmModal({
                              title: 'Liberar la reserva',
                              children: (
                                <Text size="sm">
                                  Lo que queda reservado vuelve a estar disponible para
                                  cualquier pedido.
                                </Text>
                              ),
                              labels: { confirm: 'Liberar', cancel: 'Volver' },
                              onConfirm: () => liberar.mutate(r.id!),
                            })
                          }
                        >
                          Liberar
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title={`Reservar stock de ${titular?.nombre ?? 'Nail Show'}`}
        centered
        radius="md"
      >
        {abierto ? (
          <FormularioReserva titular={titular} onListo={() => setAbierto(false)} />
        ) : null}
      </Modal>
    </Paper>
  );
}

function FormularioReserva({
  titular,
  onListo,
}: {
  titular: Tercero | null;
  onListo: () => void;
}) {
  const reservar = useReservar();
  const terceros = useTerceros();
  const disponibleNs = useDisponibleNailShow();
  const stockTercero = useStockTercero(titular?.id);
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | string>('');
  // El stock de un tercero solo se reserva para él (lo controla la base).
  const [para, setPara] = useState<string>(titular?.id ?? 'NAILSHOW');
  const [motivo, setMotivo] = useState('');
  const [vence, setVence] = useState<string | null>(
    dayjs().add(30, 'day').format('YYYY-MM-DD'),
  );

  const opciones = useMemo(() => {
    if (titular) {
      return (stockTercero.data ?? [])
        .filter((s) => Number(s.disponible) > 0)
        .map((s) => ({
          value: s.insumo_id!,
          label: `${s.insumo_nombre} · libres ${numero(Number(s.disponible), 2)} ${u(s.unidad_medida)}`,
          libre: Number(s.disponible),
        }));
    }
    return (disponibleNs.data ?? [])
      .filter((d) => Number(d.disponible) > 0)
      .map((d) => ({
        value: d.insumo_id!,
        label: `${d.insumo_nombre} · libres ${numero(Number(d.disponible), 2)}`,
        libre: Number(d.disponible),
      }));
  }, [titular, stockTercero.data, disponibleNs.data]);

  const libre = opciones.find((o) => o.value === insumoId)?.libre ?? 0;
  const n = Number(cantidad);
  const valido = Boolean(insumoId) && n > 0 && n <= libre && Boolean(vence);

  return (
    <Stack gap="md">
      <Select
        label="Insumo"
        placeholder="Solo los que tienen stock aprobado libre"
        searchable
        limit={60}
        nothingFoundMessage="Sin stock libre"
        data={opciones.map(({ value, label }) => ({ value, label }))}
        value={insumoId}
        onChange={setInsumoId}
      />
      <NumberInput
        label="Cantidad"
        min={0}
        hideControls
        value={cantidad}
        onChange={setCantidad}
        error={insumoId && n > libre ? `Libres hay ${numero(libre, 2)}` : null}
      />
      <Select
        label="Para"
        allowDeselect={false}
        disabled={Boolean(titular)}
        data={[
          ...(titular ? [] : [{ value: 'NAILSHOW', label: 'Nail Show' }]),
          ...(terceros.data ?? [])
            .filter((t) => t.activo && (!titular || t.id === titular.id))
            .map((t) => ({ value: t.id, label: t.nombre })),
        ]}
        value={para}
        onChange={(v) => setPara(v ?? 'NAILSHOW')}
      />
      <TextInput
        label="Motivo"
        placeholder="Por ejemplo: para el pedido de diciembre"
        value={motivo}
        onChange={(e) => setMotivo(e.currentTarget.value)}
      />
      <DateInput
        label="Vence"
        description="Una reserva sin uso libera el stock sola al vencer."
        valueFormat="DD/MM/YYYY"
        minDate={new Date()}
        value={vence}
        onChange={setVence}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Cancelar
        </Button>
        <Button
          color="indigo"
          loading={reservar.isPending}
          disabled={!valido}
          onClick={() =>
            reservar.mutate(
              {
                insumoId: insumoId!,
                cantidad: n,
                titular: titular?.id ?? null,
                para: para === 'NAILSHOW' ? null : para,
                motivo: motivo.trim() || null,
                venceEn: dayjs(vence).endOf('day').toISOString(),
              },
              { onSuccess: onListo },
            )
          }
        >
          Reservar
        </Button>
      </Group>
    </Stack>
  );
}
