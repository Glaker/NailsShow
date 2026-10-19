import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCalendarEvent } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import { fecha, fechaISO, numero, desdeCalendario } from '@/lib/formato';
import {
  useNomina,
  useRenglonesPedido,
  type PedidoConConteoRow,
} from '@/lib/consultasComercial';
import { useProponerFecha } from '@/lib/consultasVentas';

/**
 * Pedidos de venta que esperan que Gerencia de Producción comprometa una fecha
 * (20261019120100, bloque 3.1). Ventas carga y pide la fecha; acá Nazarena la
 * propone para el pedido entero y, si algún producto demora más, para ese
 * producto. Después Ventas aprueba y recién ahí el pedido impacta.
 *
 * Un pedido «a reconfirmar» (Ventas cambió productos o cantidades con la fecha
 * ya propuesta) vuelve a esta lista solo: lo devuelve la base.
 */
export function VentasEsperandoFecha({ pedidos }: { pedidos: PedidoConConteoRow[] }) {
  const nomina = useNomina();
  const [abierto, setAbierto] = useState<PedidoConConteoRow | null>(null);
  const esperando = pedidos
    .filter((p) => p.es_venta && p.estado === 'ESPERANDO_FECHA')
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const enVentas = pedidos.filter(
    (p) => p.es_venta && p.estado === 'FECHA_PROPUESTA',
  ).length;

  if (esperando.length === 0 && enVentas === 0) return null;

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="xs">
          <IconCalendarEvent size={20} />
          <Text fw={700}>Ventas esperando fecha</Text>
          {esperando.length ? (
            <Badge color="estadoEnAnalisis" variant="filled" radius="sm">
              {esperando.length}
            </Badge>
          ) : null}
        </Group>
        {enVentas ? (
          <Text size="sm" c="dimmed">
            {enVentas === 1
              ? '1 con fecha propuesta, esperando que Ventas la apruebe'
              : `${enVentas} con fecha propuesta, esperando que Ventas las apruebe`}
          </Text>
        ) : null}
      </Group>
      {esperando.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay pedidos de venta esperando fecha.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pedido</Table.Th>
                <Table.Th ta="right">Productos</Table.Th>
                <Table.Th>Pidió</Table.Th>
                <Table.Th>El cliente lo quiere</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {esperando.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {p.numero}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {p.cliente}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace">
                    {p.renglones[0]?.count ?? 0}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{nomina.data?.get(p.creado_por) ?? '—'}</Text>
                    <Text size="xs" c="dimmed">
                      {fecha(p.creado_en)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {p.fecha_entrega ? fecha(p.fecha_entrega) : 'Sin fecha'}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="md"
                      leftSection={<IconCalendarEvent size={18} />}
                      onClick={() => setAbierto(p)}
                    >
                      Proponer fecha
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal
        opened={abierto !== null}
        onClose={() => setAbierto(null)}
        title={abierto ? `Fecha para ${abierto.numero} · ${abierto.cliente}` : ''}
        size="lg"
        centered
      >
        {abierto ? (
          <FormularioFecha pedido={abierto} onListo={() => setAbierto(null)} />
        ) : null}
      </Modal>
    </Paper>
  );
}

function FormularioFecha({
  pedido,
  onListo,
}: {
  pedido: PedidoConConteoRow;
  onListo: () => void;
}) {
  const renglones = useRenglonesPedido(pedido.id);
  const productos = useProductos();
  const proponer = useProponerFecha();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [entera, setEntera] = useState<Date | null>(() =>
    pedido.fecha_entrega ? new Date(`${pedido.fecha_entrega}T12:00:00`) : null,
  );
  const [nota, setNota] = useState('');
  // Productos que demoran más que el resto: renglón → fecha.
  const [demora, setDemora] = useState<Record<string, Date | null>>({});
  const nombre = (id: string) =>
    (productos.data ?? []).find((x) => x.id === id)?.nombre ?? '(producto)';

  const demorados = Object.entries(demora).flatMap(([renglon_id, f]) =>
    f ? [{ renglon_id, fecha: fechaISO(f)! }] : [],
  );
  // La base exige lo mismo (fn_propuesta_renglon_valida): acá es para avisar antes.
  const demoraPosterior = entera
    ? demorados.some((d) => d.fecha > fechaISO(entera)!)
    : false;
  const pasada = entera ? entera < hoy : false;

  return (
    <Stack gap="md">
      <Text size="sm">
        Comprometé cuándo sale el pedido entero. Si algún producto demora más que el
        resto, poné su fecha: la del pedido entero no puede ser anterior. Ventas la ve y
        decide si aprueba.
      </Text>
      <DateInput
        label="Fecha del pedido entero"
        withAsterisk
        valueFormat="DD/MM/YYYY"
        minDate={hoy}
        value={entera}
        onChange={(x) => setEntera(desdeCalendario(x))}
        description={
          pedido.fecha_entrega
            ? `El cliente lo pidió para el ${fecha(pedido.fecha_entrega)}.`
            : 'El cliente no pidió una fecha.'
        }
        size="md"
      />
      {renglones.isLoading ? (
        <Skeleton h={120} />
      ) : (
        <Table fz="sm" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Cantidad</Table.Th>
              <Table.Th>Demora hasta (opcional)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(renglones.data ?? []).map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{nombre(r.producto_id)}</Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {numero(r.cantidad)}
                </Table.Td>
                <Table.Td>
                  <DateInput
                    size="xs"
                    w={150}
                    clearable
                    valueFormat="DD/MM/YYYY"
                    minDate={hoy}
                    value={demora[r.id] ?? null}
                    onChange={(x) =>
                      setDemora((m) => ({ ...m, [r.id]: desdeCalendario(x) }))
                    }
                    aria-label={`Demora de ${nombre(r.producto_id)}`}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Textarea
        label="Nota para Ventas (opcional)"
        autosize
        minRows={2}
        maxLength={1000}
        value={nota}
        onChange={(e) => setNota(e.currentTarget.value)}
      />
      {demoraPosterior ? (
        <Alert color="orange" variant="light">
          Un producto demora más que la fecha del pedido entero. Corré la fecha del pedido
          a la del producto más demorado.
        </Alert>
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onListo}>
          Volver
        </Button>
        <Button
          size="md"
          disabled={!entera || pasada || demoraPosterior}
          loading={proponer.isPending}
          onClick={() =>
            entera &&
            proponer.mutate(
              {
                id: pedido.id,
                fecha: fechaISO(entera)!,
                nota: nota.trim() || null,
                demorados,
              },
              { onSuccess: onListo },
            )
          }
        >
          Proponer fecha
        </Button>
      </Group>
    </Stack>
  );
}
