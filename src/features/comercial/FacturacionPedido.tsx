import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconFileInvoice, IconReceipt } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaHora, numero } from '@/lib/formato';
import {
  useAsignarClientePedido,
  useCambiarPrecioRenglon,
  type PedidoRenglonRow,
  type PedidoRow,
} from '@/lib/consultasComercial';
import {
  ALICUOTAS,
  ROLES_CLIENTES,
  ROLES_FACTURAN,
  TEXTO_CONDICION,
  claseFactura,
  numeroComprobante,
  useClientes,
  useEmitirFactura,
  useFacturasDePedido,
  type EstadoFactura,
  type ResultadoEmision,
} from '@/lib/consultasFacturacion';

const pesos = (n: number) => `$ ${numero(n, 2)}`;

/* ------------------------------------------------------------------------- *
 * Cliente del padrón
 * ------------------------------------------------------------------------- */

/**
 * El cliente con el que se factura. Si el pedido no lo tiene, se asigna acá;
 * la base lo deja una sola vez, aunque el pedido esté cerrado.
 */
export function ClienteDelPedido({ pedido }: { pedido: PedidoRow }) {
  const clientes = useClientes();
  const asignar = useAsignarClientePedido();
  const puede = useTieneRol(...ROLES_CLIENTES);
  const cliente = (clientes.data ?? []).find((c) => c.id === pedido.cliente_id);

  if (clientes.isLoading) return <Skeleton h={24} />;
  if (cliente) {
    return (
      <Stack gap={2}>
        <Text size="sm">{cliente.razon_social}</Text>
        <Text size="xs" c="dimmed">
          {TEXTO_CONDICION[cliente.condicion_iva]} · Factura{' '}
          {claseFactura(cliente.condicion_iva)}
        </Text>
      </Stack>
    );
  }
  if (!puede) {
    return (
      <Text size="sm" c="dimmed">
        Sin cliente del padrón
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Select
        aria-label="Cliente del padrón"
        placeholder="Asignar cliente para facturar"
        searchable
        nothingFoundMessage="No está: dalo de alta en Clientes"
        data={(clientes.data ?? [])
          .filter((c) => c.activo)
          .map((c) => ({
            value: c.id,
            label: `${c.razon_social} · Factura ${claseFactura(c.condicion_iva)}`,
          }))}
        onChange={(id) => id && asignar.mutate({ pedidoId: pedido.id, clienteId: id })}
        disabled={asignar.isPending}
      />
      <Anchor component={Link} to="/clientes" size="xs">
        Dar de alta un cliente
      </Anchor>
    </Stack>
  );
}

/* ------------------------------------------------------------------------- *
 * Precio del renglón
 * ------------------------------------------------------------------------- */

/** Celdas de precio neto, IVA y subtotal de un renglón. Editables en borrador. */
export function CeldasPrecio({
  renglon,
  editable,
}: {
  renglon: PedidoRenglonRow;
  editable: boolean;
}) {
  const cambiar = useCambiarPrecioRenglon();
  const [precio, setPrecio] = useState<number | string>(
    renglon.precio_unitario === null ? '' : Number(renglon.precio_unitario),
  );
  const subtotal =
    renglon.precio_unitario === null
      ? null
      : Number(renglon.cantidad) * Number(renglon.precio_unitario);

  function guardar(alicuota = Number(renglon.alicuota_iva)) {
    const n = precio === '' ? null : Number(precio);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    if (
      n === (renglon.precio_unitario === null ? null : Number(renglon.precio_unitario)) &&
      alicuota === Number(renglon.alicuota_iva)
    )
      return;
    cambiar.mutate({
      id: renglon.id,
      pedidoId: renglon.pedido_id,
      precioUnitario: n,
      alicuotaIva: alicuota,
    });
  }

  return (
    <>
      <Table.Td ta="right">
        {editable ? (
          <NumberInput
            aria-label="Precio unitario neto"
            prefix="$ "
            min={0}
            decimalScale={2}
            hideControls
            w={130}
            ml="auto"
            placeholder="Sin precio"
            value={precio}
            onChange={setPrecio}
            onBlur={() => guardar()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        ) : (
          <Text
            size="sm"
            ff="monospace"
            c={renglon.precio_unitario === null ? 'dimmed' : 'inherit'}
          >
            {renglon.precio_unitario === null
              ? 'Sin precio'
              : pesos(Number(renglon.precio_unitario))}
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right">
        {editable ? (
          <Select
            aria-label="IVA"
            w={92}
            ml="auto"
            allowDeselect={false}
            data={ALICUOTAS}
            value={String(Number(renglon.alicuota_iva))}
            onChange={(v) => guardar(Number(v ?? 21))}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {numero(
              Number(renglon.alicuota_iva),
              Number(renglon.alicuota_iva) % 1 ? 1 : 0,
            )}{' '}
            %
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" ff="monospace" fw={600}>
          {subtotal === null ? '—' : pesos(subtotal)}
        </Text>
      </Table.Td>
    </>
  );
}

/** Totales del pedido. Estimados: la base recalcula al emitir, redondeando por alícuota. */
export function TotalesPedido({ renglones }: { renglones: PedidoRenglonRow[] }) {
  const sinPrecio = renglones.filter((r) => r.precio_unitario === null).length;
  const neto = renglones.reduce(
    (a, r) => a + Number(r.cantidad) * Number(r.precio_unitario ?? 0),
    0,
  );
  const iva = renglones.reduce(
    (a, r) =>
      a +
      (Number(r.cantidad) * Number(r.precio_unitario ?? 0) * Number(r.alicuota_iva)) /
        100,
    0,
  );
  return (
    <Group justify="flex-end" gap="xl">
      {sinPrecio > 0 ? (
        <Text size="sm" c="estadoEnAnalisis.8">
          {sinPrecio === 1
            ? 'Un producto sin precio'
            : `${sinPrecio} productos sin precio`}
        </Text>
      ) : null}
      <Text size="sm" c="dimmed">
        Neto <b>{pesos(neto)}</b>
      </Text>
      <Text size="sm" c="dimmed">
        IVA <b>{pesos(iva)}</b>
      </Text>
      <Text size="md">
        Total <b>{pesos(neto + iva)}</b>
      </Text>
    </Group>
  );
}

/* ------------------------------------------------------------------------- *
 * Factura del pedido
 * ------------------------------------------------------------------------- */

const COLOR_ESTADO: Record<EstadoFactura, string> = {
  PENDIENTE: 'estadoEnAnalisis',
  AUTORIZADA: 'estadoAprobado',
  RECHAZADA: 'estadoRechazado',
};

export function BadgeEstadoFactura({ estado }: { estado: EstadoFactura }) {
  const texto = {
    PENDIENTE: 'Pendiente',
    AUTORIZADA: 'Autorizada',
    RECHAZADA: 'Rechazada',
  }[estado];
  return (
    <Badge color={COLOR_ESTADO[estado]} variant="light" radius="sm">
      {texto}
    </Badge>
  );
}

export function BadgeAmbiente({ ambiente }: { ambiente: 'HOMOLOGACION' | 'PRODUCCION' }) {
  return ambiente === 'HOMOLOGACION' ? (
    <Badge color="gray" variant="outline" radius="sm">
      Homologación · no fiscal
    </Badge>
  ) : null;
}

/**
 * Factura del pedido: las emitidas (autorizadas, rechazadas con su motivo) y
 * el botón para emitir. La emisión la hace la Edge Function; esta pantalla solo
 * la pide y muestra lo que ARCA contestó, también cuando rechaza.
 */
export function SeccionFactura({
  pedido,
  renglones,
}: {
  pedido: PedidoRow;
  renglones: PedidoRenglonRow[];
}) {
  const facturas = useFacturasDePedido(pedido.id);
  const clientes = useClientes();
  const emitir = useEmitirFactura();
  const puedeFacturar = useTieneRol(...ROLES_FACTURAN);
  const [ultimo, setUltimo] = useState<ResultadoEmision | null>(null);

  const lista = facturas.data ?? [];
  const autorizada = lista.find((f) => f.estado === 'AUTORIZADA');
  const pendiente = lista.find((f) => f.estado === 'PENDIENTE');
  const cliente = (clientes.data ?? []).find((c) => c.id === pedido.cliente_id);

  const faltas: string[] = [];
  if (pedido.estado === 'BORRADOR') faltas.push('el pedido está en borrador');
  if (pedido.estado === 'CANCELADO') faltas.push('el pedido está cancelado');
  if (!pedido.cliente_id) faltas.push('falta el cliente del padrón');
  if (renglones.length === 0) faltas.push('no tiene productos');
  if (renglones.some((r) => r.precio_unitario === null))
    faltas.push('hay productos sin precio');

  function confirmarEmision() {
    const clase = cliente ? claseFactura(cliente.condicion_iva) : '?';
    modals.openConfirmModal({
      title: `Emitir Factura ${clase}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            A <b>{cliente?.razon_social}</b> por el pedido {pedido.numero}. Se pide el CAE
            a ARCA: una factura autorizada no se modifica ni se borra; se corrige con nota
            de crédito.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Emitir', cancel: 'Volver' },
      confirmProps: { color: 'violeta' },
      onConfirm: () => emitir.mutate(pedido.id, { onSuccess: setUltimo }),
    });
  }

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="xs">
            <IconFileInvoice size={20} />
            <Text fw={600}>Factura</Text>
          </Group>
          {puedeFacturar && !autorizada ? (
            <Button
              size="md"
              leftSection={<IconReceipt size={18} />}
              disabled={faltas.length > 0}
              loading={emitir.isPending}
              onClick={confirmarEmision}
            >
              {pendiente ? 'Reintentar emisión' : 'Emitir factura'}
            </Button>
          ) : null}
        </Group>

        {!autorizada && faltas.length > 0 && puedeFacturar ? (
          <Text size="sm" c="dimmed">
            Para facturar: {faltas.join(', ')}.
          </Text>
        ) : null}

        {ultimo && ultimo.estado === 'RECHAZADA' ? (
          <Alert
            color="estadoRechazado"
            variant="light"
            radius="md"
            icon={<IconAlertTriangle size={18} />}
            title="ARCA rechazó el comprobante"
          >
            {ultimo.motivo}
          </Alert>
        ) : null}
        {ultimo && ultimo.estado === 'PENDIENTE' ? (
          <Alert
            color="estadoEnAnalisis"
            variant="light"
            radius="md"
            icon={<IconAlertTriangle size={18} />}
            title="No se supo qué contestó ARCA"
          >
            {ultimo.motivo}
          </Alert>
        ) : null}

        {facturas.isLoading ? (
          <Skeleton h={60} />
        ) : lista.length === 0 ? (
          <Text size="sm" c="dimmed">
            Todavía no se emitió factura para este pedido.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>CAE / motivo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.map((f) => (
                  <Table.Tr key={f.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        Factura {f.tipo} {numeroComprobante(f)}
                      </Text>
                      <Group gap={6}>
                        <Text size="xs" c="dimmed">
                          {fecha(`${f.fecha}T12:00:00`)}
                        </Text>
                        <BadgeAmbiente ambiente={f.ambiente} />
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {pesos(Number(f.importe_total))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <BadgeEstadoFactura estado={f.estado} />
                    </Table.Td>
                    <Table.Td>
                      {f.estado === 'AUTORIZADA' ? (
                        <>
                          <Text size="sm" ff="monospace">
                            CAE {f.cae}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Vence {fecha(`${f.cae_vencimiento}T12:00:00`)}
                          </Text>
                        </>
                      ) : (
                        <Text
                          size="sm"
                          c={f.estado === 'RECHAZADA' ? 'estadoRechazado.7' : 'dimmed'}
                        >
                          {f.motivo_rechazo ?? `En curso desde ${fechaHora(f.creado_en)}`}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Paper>
  );
}
