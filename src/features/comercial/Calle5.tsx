import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBookmark,
  IconBuildingFactory2,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useDepositos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import { useClientes } from '@/lib/consultasFacturacion';
import { ROLES_STOCK_PT } from '@/lib/consultasStockSeguridad';
import {
  agruparPorPedido,
  disponiblePara,
  useCalle5,
  useDespacharPedido,
  useLiberarReservaPt,
  usePendientesDespacho,
  useProducirParaCalle5,
  useReservarPt,
  useReservasPt,
  type DepositoPt,
  type FilaCalle5,
  type PedidoADespachar,
  type ReservaPtRow,
} from '@/lib/consultasCalle5';

/**
 * Calle 5 para los pedidos de Nail Show (ítems 19 a 22 de la cola).
 *
 * El sistema no reparte: muestra qué pide cada pedido, qué hay libre y qué
 * está reservado, y quién decide es la encargada de stock (o Mati). La base
 * no deja sacar lo que no hay ni lo reservado para otro.
 */
export function PanelCalle5() {
  const [vista, setVista] = useState<string | null>('pedidos');
  return (
    <Tabs value={vista} onChange={setVista} color="azul" keepMounted={false}>
      <Tabs.List mb="md">
        <Tabs.Tab value="pedidos" leftSection={<IconTruckDelivery size={17} />}>
          Pedidos a despachar
        </Tabs.Tab>
        <Tabs.Tab value="productos" leftSection={<IconBuildingFactory2 size={17} />}>
          Por producto
        </Tabs.Tab>
        <Tabs.Tab value="reservas" leftSection={<IconBookmark size={17} />}>
          Reservas
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="pedidos">
        <PedidosADespachar />
      </Tabs.Panel>
      <Tabs.Panel value="productos">
        <PorProducto />
      </Tabs.Panel>
      <Tabs.Panel value="reservas">
        <Reservas />
      </Tabs.Panel>
    </Tabs>
  );
}

function PedidosADespachar() {
  const pendientes = usePendientesDespacho();
  const puede = useTieneRol(...ROLES_STOCK_PT);
  const [despachando, setDespachando] = useState<PedidoADespachar | null>(null);

  if (pendientes.isLoading) return <Skeleton h={200} />;
  const pedidos = agruparPorPedido(pendientes.data ?? []);
  if (pedidos.length === 0) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio
          icono={IconTruckDelivery}
          titulo="No hay pedidos pendientes de despacho"
          descripcion="Aparecen acá los pedidos de clientes de Nail Show enviados y todavía no entregados completos."
        />
      </Paper>
    );
  }

  return (
    <>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pedido</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Entrega</Table.Th>
                <Table.Th>Productos</Table.Th>
                <Table.Th ta="right">Pendiente</Table.Th>
                {puede ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pedidos.map((p) => {
                const parcial = p.renglones.some((r) => Number(r.despachado) > 0);
                return (
                  <Table.Tr key={p.pedido_id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/pedidos/${p.pedido_id}`} fw={600}>
                        {p.numero}
                      </Anchor>
                      {parcial ? (
                        <Badge ml={6} size="xs" color="estadoCuarentena" variant="light">
                          con faltantes
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.cliente}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{fecha(p.fecha_entrega)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={2}>
                        {p.renglones
                          .filter((r) => Number(r.pendiente) > 0)
                          .map((r) => `${r.producto} ×${numero(Number(r.pendiente), 0)}`)
                          .join(' · ')}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text ff="monospace" fw={700}>
                        {numero(p.pendiente, 0)}
                      </Text>
                    </Table.Td>
                    {puede ? (
                      <Table.Td>
                        <Button
                          size="compact-md"
                          leftSection={<IconTruckDelivery size={16} />}
                          onClick={() => setDespachando(p)}
                        >
                          Despachar
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <ModalDespacho pedido={despachando} onCerrar={() => setDespachando(null)} />
    </>
  );
}

/**
 * Despacho del pedido entero: cada renglón con lo pendiente y lo que puede
 * salir para este cliente. Quien despacha marca «completo» o «con faltantes»
 * (ítem 21): lo que no sale queda pendiente en el pedido.
 */
export function ModalDespacho({
  pedido,
  onCerrar,
}: {
  pedido: PedidoADespachar | null;
  onCerrar: () => void;
}) {
  return (
    <Modal
      opened={pedido !== null}
      onClose={onCerrar}
      title={pedido ? `Despachar el pedido ${pedido.numero} · ${pedido.cliente}` : ''}
      size="xl"
      centered
      radius="md"
    >
      {pedido ? <FormularioDespacho pedido={pedido} onListo={onCerrar} /> : null}
    </Modal>
  );
}

function FormularioDespacho({
  pedido,
  onListo,
}: {
  pedido: PedidoADespachar;
  onListo: () => void;
}) {
  const calle5 = useCalle5();
  const reservas = useReservasPt();
  const despachar = useDespacharPedido();
  const [deposito, setDeposito] = useState<DepositoPt>('C5');
  const [observacion, setObservacion] = useState('');
  const renglones = pedido.renglones.filter((r) => Number(r.pendiente) > 0);

  const puedeSalir = (productoId: string, enFabrica: number) =>
    deposito === 'C5'
      ? disponiblePara(
          productoId,
          pedido.pedido_id,
          pedido.cliente_id,
          calle5.data ?? [],
          reservas.data ?? [],
        )
      : // Desde fábrica: lo producido para este pedido o el stock libre de fábrica.
        Math.max(
          enFabrica,
          Number(
            (calle5.data ?? []).find((f) => f.producto_id === productoId)?.en_fabrica ??
              0,
          ),
        );

  const [cantidades, setCantidades] = useState<Record<string, number | string> | null>(
    null,
  );
  const valores: Record<string, number | string> =
    cantidades ??
    Object.fromEntries(
      renglones.map((r) => [
        r.producto_id ?? '',
        Math.min(
          Number(r.pendiente),
          Math.max(puedeSalir(r.producto_id ?? '', Number(r.en_fabrica_para_pedido)), 0),
        ),
      ]),
    );

  const cant = (id: string) => {
    const v = valores[id];
    return typeof v === 'number' ? v : Number(v || 0);
  };
  const sale = renglones.reduce((a, r) => a + cant(r.producto_id ?? ''), 0);
  const queda = renglones.reduce(
    (a, r) => a + Number(r.pendiente) - cant(r.producto_id ?? ''),
    0,
  );
  const excedidos = renglones.filter(
    (r) =>
      cant(r.producto_id ?? '') > Number(r.pendiente) || cant(r.producto_id ?? '') < 0,
  );

  if (calle5.isLoading || reservas.isLoading) return <Skeleton h={200} />;

  return (
    <Stack gap="md">
      <SegmentedControl
        value={deposito}
        onChange={(v) => {
          setDeposito(v as DepositoPt);
          setCantidades(null);
        }}
        data={[
          { value: 'C5', label: 'Sale de Calle 5' },
          { value: 'PTF', label: 'Sale de fábrica' },
        ]}
      />
      <Table.ScrollContainer minWidth={620}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Pedido</Table.Th>
              <Table.Th ta="right">Ya salió</Table.Th>
              <Table.Th ta="right">Pendiente</Table.Th>
              <Table.Th ta="right">Hay para este cliente</Table.Th>
              <Table.Th ta="right">Sale ahora</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {renglones.map((r) => {
              const hay = puedeSalir(
                r.producto_id ?? '',
                Number(r.en_fabrica_para_pedido),
              );
              const falta = Number(r.pendiente) > hay;
              return (
                <Table.Tr key={r.producto_id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {r.producto}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {r.codigo_interno}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{numero(Number(r.cantidad), 0)}</Table.Td>
                  <Table.Td ta="right">{numero(Number(r.despachado), 0)}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {numero(Number(r.pendiente), 0)}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text
                      size="sm"
                      {...(falta ? { c: 'estadoRechazado.7' } : {})}
                      fw={600}
                    >
                      {numero(Math.max(hay, 0), 0)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <NumberInput
                      aria-label={`Cantidad de ${r.producto} que sale`}
                      w={110}
                      ml="auto"
                      min={0}
                      max={Number(r.pendiente)}
                      allowDecimal={false}
                      hideControls
                      value={valores[r.producto_id ?? ''] ?? 0}
                      onChange={(v) =>
                        setCantidades({ ...valores, [r.producto_id ?? '']: v })
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {queda > 0 ? (
        <Alert
          color="estadoCuarentena"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
          title="Despacho con faltantes"
        >
          Quedan {numero(queda, 0)} unidades pendientes en el pedido. Van a seguir
          apareciendo acá y en lo que falta producir.
        </Alert>
      ) : (
        <Alert color="estadoAprobado" variant="light" radius="md" title="Pedido completo">
          Sale todo lo pendiente: el pedido queda entregado.
        </Alert>
      )}

      <TextInput
        label="Observación"
        placeholder="Por ejemplo: retira el cliente, viaja con el flete"
        value={observacion}
        onChange={(e) => setObservacion(e.currentTarget.value)}
      />

      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Volver
        </Button>
        <Button
          size="md"
          leftSection={<IconTruckDelivery size={18} />}
          loading={despachar.isPending}
          disabled={sale <= 0 || excedidos.length > 0}
          color={queda > 0 ? 'estadoCuarentena' : 'azul'}
          onClick={() =>
            despachar.mutate(
              {
                pedidoId: pedido.pedido_id,
                renglones: renglones
                  .map((r) => ({
                    productoId: r.producto_id ?? '',
                    cantidad: cant(r.producto_id ?? ''),
                  }))
                  .filter((r) => r.cantidad > 0),
                deposito,
                conFaltantes: queda > 0,
                observacion: observacion.trim() || null,
              },
              { onSuccess: onListo },
            )
          }
        >
          {queda > 0 ? 'Despachar con faltantes' : 'Despachar completo'}
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Por producto: qué hay en Calle 5, qué está reservado, qué piden los pedidos
 * abiertos y qué falta producir sumando todos. Desde acá se reserva para un
 * pedido y se manda a producir lo que falta.
 */
function PorProducto() {
  const calle5 = useCalle5();
  const pendientes = usePendientesDespacho();
  const puede = useTieneRol(...ROLES_STOCK_PT);
  const puedeProducir = useTieneRol(
    'GERENCIA_PRODUCCION',
    'ADMINISTRACION',
    'DIRECCION_TECNICA',
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [reservando, setReservando] = useState<{
    productoId: string;
    pedidoId: string | null;
  } | null>(null);
  const [produciendo, setProduciendo] = useState(false);

  if (calle5.isLoading) return <Skeleton h={200} />;
  const filas = calle5.data ?? [];
  const faltan = filas.filter((f) => Number(f.falta_producir) > 0);
  if (filas.length === 0) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio
          icono={IconBuildingFactory2}
          titulo="Sin movimiento en Calle 5"
          descripcion="Aparecen los productos con stock en Calle 5, reservados o pedidos por clientes."
        />
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {faltan.length > 0 ? (
        <Alert
          color="estadoEnAnalisis"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
          title={`Falta producir ${faltan.length === 1 ? 'un producto' : `${faltan.length} productos`} para cubrir los pedidos`}
        >
          <Group justify="space-between" align="flex-end" wrap="wrap">
            <Text size="sm">
              Se suma lo que piden todos los pedidos abiertos y se resta lo que hay en
              Calle 5, lo producido para ellos en fábrica y lo que ya está en producción.
            </Text>
            {puedeProducir ? (
              <Button onClick={() => setProduciendo(true)}>
                Mandar a producir lo que falta
              </Button>
            ) : null}
          </Group>
        </Alert>
      ) : null}

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={860}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">En Calle 5</Table.Th>
                <Table.Th ta="right">Reservado</Table.Th>
                <Table.Th ta="right">Libre</Table.Th>
                <Table.Th ta="right">Piden</Table.Th>
                <Table.Th ta="right">En producción</Table.Th>
                <Table.Th ta="right">Falta producir</Table.Th>
                <Table.Th ta="right">En fábrica</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => (
                <FilaProducto
                  key={f.producto_id}
                  fila={f}
                  abierto={abierto === f.producto_id}
                  onAbrir={() =>
                    setAbierto(abierto === f.producto_id ? null : f.producto_id)
                  }
                  pedidos={(pendientes.data ?? []).filter(
                    (p) => p.producto_id === f.producto_id && Number(p.pendiente) > 0,
                  )}
                  puedeReservar={puede}
                  onReservar={(pedidoId) =>
                    setReservando({ productoId: f.producto_id ?? '', pedidoId })
                  }
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <ModalReserva
        inicial={reservando}
        onCerrar={() => setReservando(null)}
        pedidos={pendientes.data ?? []}
      />
      <ModalProducir
        abierto={produciendo}
        onCerrar={() => setProduciendo(false)}
        filas={faltan}
      />
    </Stack>
  );
}

function FilaProducto({
  fila: f,
  abierto,
  onAbrir,
  pedidos,
  puedeReservar,
  onReservar,
}: {
  fila: FilaCalle5;
  abierto: boolean;
  onAbrir: () => void;
  pedidos: ReturnType<typeof usePendientesDespacho>['data'] & object;
  puedeReservar: boolean;
  onReservar: (pedidoId: string | null) => void;
}) {
  const falta = Number(f.falta_producir);
  return (
    <>
      <Table.Tr onClick={onAbrir} style={{ cursor: 'pointer' }}>
        <Table.Td>
          <Text size="sm" fw={600}>
            {f.producto}
          </Text>
          <Text size="xs" c="dimmed">
            {f.codigo_interno}
            {Number(f.pedidos) > 0
              ? ` · ${f.pedidos} ${Number(f.pedidos) === 1 ? 'pedido' : 'pedidos'}`
              : ''}
          </Text>
        </Table.Td>
        <Table.Td ta="right" ff="monospace" fw={700}>
          {numero(Number(f.en_calle5), 0)}
        </Table.Td>
        <Table.Td ta="right" ff="monospace">
          {numero(Number(f.reservado), 0)}
        </Table.Td>
        <Table.Td ta="right" ff="monospace" fw={600}>
          <Text span {...(Number(f.libre) < 0 ? { c: 'estadoRechazado.7' } : {})} inherit>
            {numero(Number(f.libre), 0)}
          </Text>
        </Table.Td>
        <Table.Td ta="right" ff="monospace">
          {numero(Number(f.pendiente), 0)}
        </Table.Td>
        <Table.Td ta="right" ff="monospace">
          {numero(Number(f.en_produccion), 0)}
        </Table.Td>
        <Table.Td ta="right">
          {falta > 0 ? (
            <Badge color="estadoEnAnalisis" variant="light" size="lg" radius="sm">
              {numero(falta, 0)}
            </Badge>
          ) : (
            <Text size="sm" c="dimmed">
              —
            </Text>
          )}
        </Table.Td>
        <Table.Td ta="right" ff="monospace" c="dimmed">
          {numero(Number(f.en_fabrica), 0)}
        </Table.Td>
      </Table.Tr>
      {abierto ? (
        <Table.Tr>
          <Table.Td colSpan={8} style={{ background: 'var(--mantine-color-azul-light)' }}>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                Quién lo pide. El sistema no reparte: reservá para el pedido que tiene que
                recibirlo.
              </Text>
              {pedidos.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Ningún pedido abierto lo pide.
                </Text>
              ) : (
                pedidos.map((p) => (
                  <Group key={p.pedido_id} justify="space-between" wrap="nowrap">
                    <Text size="sm">
                      <Anchor component={Link} to={`/pedidos/${p.pedido_id}`}>
                        {p.numero}
                      </Anchor>{' '}
                      · {p.cliente} · entrega {fecha(p.fecha_entrega)} · pendiente{' '}
                      <b>{numero(Number(p.pendiente), 0)}</b>
                      {Number(p.reservado_para_pedido) > 0
                        ? ` · reservado ${numero(Number(p.reservado_para_pedido), 0)}`
                        : ''}
                    </Text>
                    {puedeReservar ? (
                      <Button
                        size="compact-sm"
                        variant="light"
                        leftSection={<IconBookmark size={14} />}
                        onClick={() => onReservar(p.pedido_id)}
                      >
                        Reservar
                      </Button>
                    ) : null}
                  </Group>
                ))
              )}
              {puedeReservar ? (
                <Group justify="flex-end">
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    onClick={() => onReservar(null)}
                  >
                    Reservar para un cliente sin pedido
                  </Button>
                </Group>
              ) : null}
            </Stack>
          </Table.Td>
        </Table.Tr>
      ) : null}
    </>
  );
}

function ModalReserva({
  inicial,
  onCerrar,
  pedidos,
}: {
  inicial: { productoId: string; pedidoId: string | null } | null;
  onCerrar: () => void;
  pedidos: NonNullable<ReturnType<typeof usePendientesDespacho>['data']>;
}) {
  const depositos = useDepositos();
  const clientes = useClientes();
  const calle5 = useCalle5();
  const reservar = useReservarPt();
  const [cantidad, setCantidad] = useState<number | string>('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [observacion, setObservacion] = useState('');
  const c5 = (depositos.data ?? []).find((d) => d.numero === 'C5');
  const fila = (calle5.data ?? []).find((f) => f.producto_id === inicial?.productoId);
  const pedido = pedidos.find(
    (p) => p.pedido_id === inicial?.pedidoId && p.producto_id === inicial?.productoId,
  );
  const libre = Math.max(Number(fila?.libre ?? 0), 0);
  const tope = pedido ? Math.min(libre, Number(pedido.pendiente)) : libre;
  const n = typeof cantidad === 'number' ? cantidad : Number(cantidad || 0);

  function cerrar() {
    setCantidad('');
    setClienteId(null);
    setObservacion('');
    onCerrar();
  }

  return (
    <Modal
      opened={inicial !== null}
      onClose={cerrar}
      title={`Reservar ${fila?.producto ?? ''} en Calle 5`}
      centered
      radius="md"
    >
      <Stack gap="md">
        <Text size="sm">
          Hay <b>{numero(libre, 0)}</b> libres.{' '}
          {pedido
            ? `Para el pedido ${pedido.numero} (${pedido.cliente}), que tiene ${numero(Number(pedido.pendiente), 0)} pendientes.`
            : 'Para un cliente: la toma cualquiera de sus pedidos al despachar.'}
        </Text>
        {pedido ? null : (
          <Select
            label="Cliente"
            searchable
            data={(clientes.data ?? [])
              .filter((c) => c.activo)
              .map((c) => ({ value: c.id, label: c.razon_social }))}
            value={clienteId}
            onChange={setClienteId}
          />
        )}
        <NumberInput
          label="Cantidad"
          min={1}
          max={tope}
          allowDecimal={false}
          value={cantidad}
          onChange={setCantidad}
          error={n > tope ? `No hay más de ${numero(tope, 0)} para reservar` : null}
        />
        <TextInput
          label="Observación"
          value={observacion}
          onChange={(e) => setObservacion(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={cerrar}>
            Volver
          </Button>
          <Button
            loading={reservar.isPending}
            disabled={!c5 || !inicial || n <= 0 || n > tope || (!pedido && !clienteId)}
            onClick={() =>
              inicial &&
              c5 &&
              reservar.mutate(
                {
                  productoId: inicial.productoId,
                  depositoId: c5.id,
                  cantidad: n,
                  pedidoId: pedido?.pedido_id ?? null,
                  clienteId: pedido ? null : clienteId,
                  observacion: observacion.trim() || null,
                },
                { onSuccess: cerrar },
              )
            }
          >
            Reservar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** «Mandar a producir lo que falta»: un pedido para stock con destino Calle 5. */
function ModalProducir({
  abierto,
  onCerrar,
  filas,
}: {
  abierto: boolean;
  onCerrar: () => void;
  filas: FilaCalle5[];
}) {
  const depositos = useDepositos();
  const producir = useProducirParaCalle5();
  const [cantidades, setCantidades] = useState<Record<string, number | string> | null>(
    null,
  );
  const c5 = (depositos.data ?? []).find((d) => d.numero === 'C5');
  const valores =
    cantidades ??
    Object.fromEntries(filas.map((f) => [f.producto_id ?? '', Number(f.falta_producir)]));
  const renglones = filas
    .map((f) => ({
      productoId: f.producto_id ?? '',
      cantidad: Number(valores[f.producto_id ?? ''] || 0),
    }))
    .filter((r) => r.cantidad > 0);

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Mandar a producir para Calle 5"
      size="lg"
      centered
      radius="md"
    >
      <Stack gap="md">
        <Text size="sm">
          Se arma un pedido para stock con destino Calle 5 y le llega a Producción. Podés
          ajustar las cantidades. Al terminarlo, Producción confirma cuánto salió y adónde
          va.
        </Text>
        <Table verticalSpacing="xs">
          <Table.Tbody>
            {filas.map((f) => (
              <Table.Tr key={f.producto_id}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {f.producto}
                  </Text>
                  <Text size="xs" c="dimmed">
                    falta {numero(Number(f.falta_producir), 0)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <NumberInput
                    aria-label={`Cantidad a producir de ${f.producto}`}
                    w={120}
                    ml="auto"
                    min={0}
                    allowDecimal={false}
                    hideControls
                    value={valores[f.producto_id ?? ''] ?? 0}
                    onChange={(v) =>
                      setCantidades({ ...valores, [f.producto_id ?? '']: v })
                    }
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            loading={producir.isPending}
            disabled={!c5 || renglones.length === 0}
            onClick={() =>
              c5 &&
              producir.mutate(
                { depositoC5Id: c5.id, renglones, observaciones: null },
                {
                  onSuccess: () => {
                    setCantidades(null);
                    onCerrar();
                  },
                },
              )
            }
          >
            Enviar a producción
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Reservas() {
  const reservas = useReservasPt();
  const calle5 = useCalle5();
  const clientes = useClientes();
  const pendientes = usePendientesDespacho();
  const liberar = useLiberarReservaPt();
  const puede = useTieneRol(...ROLES_STOCK_PT);
  const [liberando, setLiberando] = useState<ReservaPtRow | null>(null);
  const [motivo, setMotivo] = useState('');

  if (reservas.isLoading) return <Skeleton h={160} />;
  const filas = reservas.data ?? [];
  const producto = (id: string) =>
    (calle5.data ?? []).find((f) => f.producto_id === id)?.producto ?? '(producto)';
  const cliente = (id: string | null) =>
    (clientes.data ?? []).find((c) => c.id === id)?.razon_social ?? null;
  const pedido = (id: string | null) =>
    (pendientes.data ?? []).find((p) => p.pedido_id === id)?.numero ?? null;

  if (filas.length === 0) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio
          icono={IconBookmark}
          titulo="No hay reservas vigentes"
          descripcion="Se reserva desde «Por producto», para un pedido o para un cliente."
        />
      </Paper>
    );
  }

  return (
    <>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Para</Table.Th>
                <Table.Th ta="right">Reservado</Table.Th>
                <Table.Th ta="right">Ya salió</Table.Th>
                <Table.Th>Desde</Table.Th>
                {puede ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {producto(r.producto_id)}
                    </Text>
                    {r.observacion ? (
                      <Text size="xs" c="dimmed">
                        {r.observacion}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {cliente(r.cliente_id) ?? '—'}
                      {r.pedido_id ? ` · pedido ${pedido(r.pedido_id) ?? ''}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace" fw={600}>
                    {numero(Number(r.cantidad), 0)}
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace">
                    {numero(Number(r.consumido), 0)}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{fecha(r.creado_en)}</Text>
                  </Table.Td>
                  {puede ? (
                    <Table.Td>
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setLiberando(r)}
                      >
                        Liberar
                      </Button>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <Modal
        opened={liberando !== null}
        onClose={() => setLiberando(null)}
        title="Liberar la reserva"
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Lo que queda sin salir vuelve a estar libre para cualquier cliente. Queda
            registrado quién la liberó y por qué.
          </Text>
          <TextInput
            label="Motivo"
            placeholder="Por ejemplo: el cliente canceló"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setLiberando(null)}>
              Volver
            </Button>
            <Button
              loading={liberar.isPending}
              disabled={motivo.trim().length < 3}
              onClick={() =>
                liberando &&
                liberar.mutate(
                  { id: liberando.id, motivo: motivo.trim() },
                  {
                    onSuccess: () => {
                      setLiberando(null);
                      setMotivo('');
                    },
                  },
                )
              }
            >
              Liberar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/**
 * El pedido contra Calle 5 (ítem 19): por producto, lo pendiente, lo que hay
 * para este cliente (libre más lo reservado para él) y lo que falta. Lo que
 * falta se manda a producir desde Calle 5 → «Por producto», sumado con los
 * demás pedidos: sumar faltantes pedido por pedido da un número falso.
 */
export function CoberturaCalle5({ pedido }: { pedido: PedidoADespachar }) {
  const calle5 = useCalle5();
  const reservas = useReservasPt();
  if (calle5.isLoading || reservas.isLoading) return <Skeleton h={120} />;
  const filas = pedido.renglones.filter((r) => Number(r.pendiente) > 0);
  const conDisponible = filas.map((r) => {
    const hay = disponiblePara(
      r.producto_id ?? '',
      pedido.pedido_id,
      pedido.cliente_id,
      calle5.data ?? [],
      reservas.data ?? [],
    );
    return { ...r, hay, falta: Math.max(Number(r.pendiente) - hay, 0) };
  });
  const falta = conDisponible.reduce((a, r) => a + r.falta, 0);

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Contra Calle 5</Text>
          {falta > 0 ? (
            <Badge color="estadoEnAnalisis" variant="light" size="lg" radius="sm">
              Faltan {numero(falta, 0)}
            </Badge>
          ) : (
            <Badge color="estadoAprobado" variant="light" size="lg" radius="sm">
              Alcanza lo de Calle 5
            </Badge>
          )}
        </Group>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Pendiente</Table.Th>
                <Table.Th ta="right">Hay para este cliente</Table.Th>
                <Table.Th ta="right">Falta</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {conDisponible.map((r) => (
                <Table.Tr key={r.producto_id}>
                  <Table.Td>
                    <Text size="sm">{r.producto}</Text>
                  </Table.Td>
                  <Table.Td ta="right">{numero(Number(r.pendiente), 0)}</Table.Td>
                  <Table.Td ta="right">{numero(r.hay, 0)}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {r.falta > 0 ? numero(r.falta, 0) : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {falta > 0 ? (
          <Text size="xs" c="dimmed">
            Lo libre lo pueden estar esperando otros pedidos: quién lo recibe se decide al
            reservar o despachar. Para producir lo que falta, sumado con los demás
            pedidos,{' '}
            <Anchor component={Link} to="/punto-venta" size="xs">
              Calle 5 → Por producto
            </Anchor>
            .
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
