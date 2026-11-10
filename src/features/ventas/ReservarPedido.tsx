import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconBookmark } from '@tabler/icons-react';
import { numero } from '@/lib/formato';
import {
  DEPOSITOS_VENTA,
  useDisponiblePt,
  useReservarParaPedido,
  type ReservaPedido,
} from '@/lib/consultasVentas';

export interface RenglonAReservar {
  productoId: string;
  producto: string;
  /** Lo que pide el pedido (o lo que le falta despachar, si ya está aprobado). */
  pide: number;
}

/**
 * Reservar stock para un pedido de venta (pedido del 2026-11-10): arranca en
 * el depósito del que sale el pedido y se puede cambiar. Por producto muestra
 * cuánto pide, cuánto ya tiene reservado ahí y cuánto hay libre; sugiere
 * reservar lo que alcanza. Si el pedido todavía se edita, cambiar el depósito
 * acá cambia también de dónde sale (onCambiarDeposito).
 */
export function ReservarPedido({
  abierto,
  onCerrar,
  pedidoId,
  depositoId,
  depositos,
  renglones,
  reservas,
  onCambiarDeposito,
}: {
  abierto: boolean;
  onCerrar: () => void;
  pedidoId: string;
  depositoId: string | null;
  depositos: { id: string; numero: string }[];
  renglones: RenglonAReservar[];
  reservas: ReservaPedido[];
  /** Solo si el pedido se edita: pasa a salir del depósito elegido. */
  onCambiarDeposito?: ((depositoId: string) => Promise<unknown>) | undefined;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [cant, setCant] = useState<Record<string, number | string>>({});
  const dep = elegido ?? depositoId;
  const libres = useDisponiblePt(dep);
  const reservar = useReservarParaPedido();
  const numeroDe = (id: string | null) => depositos.find((d) => d.id === id)?.numero;
  const nombre = (id: string | null) =>
    DEPOSITOS_VENTA.find((d) => d.numero === numeroDe(id))?.etiqueta ?? 'el depósito';

  const filas = renglones.map((r) => {
    const ya = reservas
      .filter((x) => x.producto_id === r.productoId && x.deposito_id === dep)
      .reduce((s, x) => s + x.vigente, 0);
    const libre = libres.data?.get(r.productoId) ?? 0;
    const tope = Math.max(Math.min(r.pide - ya, libre), 0);
    const v = cant[r.productoId];
    const valor = v === undefined ? tope : Number(v || 0);
    return { ...r, ya, libre, tope, valor };
  });
  const aReservar = filas.filter((f) => f.valor > 0);
  const pasado = filas.some((f) => f.valor > f.tope);
  const cambia = dep !== depositoId && dep !== null;

  function cerrar() {
    setElegido(null);
    setCant({});
    onCerrar();
  }

  async function confirmar() {
    if (!dep) return;
    if (cambia && onCambiarDeposito) await onCambiarDeposito(dep);
    await reservar.mutateAsync({
      pedidoId,
      depositoId: dep,
      renglones: aReservar.map((f) => ({ productoId: f.productoId, cantidad: f.valor })),
    });
    cerrar();
  }

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title={`Reservar stock de ${nombre(dep)}`}
      size="lg"
      centered
      radius="md"
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            ¿De qué depósito?
          </Text>
          <SegmentedControl
            fullWidth
            size="md"
            value={numeroDe(dep) ?? ''}
            onChange={(n) => {
              setElegido(depositos.find((d) => d.numero === n)?.id ?? null);
              setCant({});
            }}
            data={DEPOSITOS_VENTA.map((d) => ({ value: d.numero, label: d.etiqueta }))}
          />
          {cambia ? (
            <Text size="xs" c="orange.8">
              {onCambiarDeposito
                ? `El pedido sale de ${nombre(depositoId)}: al reservar pasa a salir de ${nombre(dep)}.`
                : `El pedido sale de ${nombre(depositoId)}: esta reserva se consume al despachar desde ${nombre(dep)}.`}
            </Text>
          ) : null}
        </Stack>
        <Table fz="sm" verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Pide</Table.Th>
              <Table.Th ta="right">Reservado</Table.Th>
              <Table.Th ta="right">Libre</Table.Th>
              <Table.Th w={110}>Reservar</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f) => (
              <Table.Tr key={f.productoId}>
                <Table.Td>{f.producto}</Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {numero(f.pide)}
                </Table.Td>
                <Table.Td ta="right">
                  {f.ya > 0 ? (
                    <Badge color="teal" variant="light">
                      {numero(f.ya)}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td
                  ta="right"
                  ff="monospace"
                  {...(f.libre === 0 ? { c: 'red' } : {})}
                >
                  {numero(f.libre)}
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="sm"
                    min={0}
                    max={f.tope}
                    allowDecimal={false}
                    hideControls
                    disabled={f.tope === 0}
                    value={f.tope === 0 ? '' : (cant[f.productoId] ?? f.tope)}
                    placeholder="0"
                    error={f.valor > f.tope ? `hasta ${numero(f.tope)}` : undefined}
                    onChange={(x) => setCant((m) => ({ ...m, [f.productoId]: x }))}
                    aria-label={`Reservar de ${f.producto}`}
                  />
                  {f.pide - f.ya - f.valor > 0 && f.valor <= f.tope ? (
                    <Text size="xs" c="orange.8" mt={2}>
                      faltan {numero(f.pide - f.ya - f.valor)}: van a Producción
                    </Text>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {filas.length > 0 && filas.every((f) => f.tope === 0) && !libres.isLoading ? (
          <Alert color="orange" variant="light">
            En {nombre(dep)} no hay nada libre de lo que falta reservar. Probá con otro
            depósito o pedí la fecha a Producción.
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            size="md"
            leftSection={<IconBookmark size={18} />}
            disabled={aReservar.length === 0 || pasado}
            loading={reservar.isPending}
            onClick={() => void confirmar()}
          >
            {filas.some((f) => f.pide - f.ya > f.tope)
              ? 'Reservar lo que hay: '
              : 'Reservar '}
            {numero(aReservar.reduce((s, f) => s + f.valor, 0))} en {nombre(dep)}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
