import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconFileInvoice, IconSearch, IconTruckDelivery } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { fecha, fechaHora, numero } from '@/lib/formato';
import {
  useDespacharPedidoReservado,
  useVentas,
  type FilaVenta,
} from '@/lib/consultasVentas';
import {
  useAnularFactura,
  useFacturasX,
  type FacturaXCargada,
} from '@/lib/consultasDespacho';
import { CargarFacturaX } from './CargarFacturaX';
import { useTieneRol } from '@/features/auth/sesion';

type Vista = 'despachar' | 'historial' | 'facturas';
const CANAL = {
  MAYORISTA: 'Mayorista',
  EDUCADORES: 'Educadores',
  MINORISTA: 'Minorista',
} as const;
const APROBADO = ['CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO'];

/**
 * Despacho (D-factura-x-1, D-factura-x-2): los pedidos aprobados que esperan
 * salir, con «Factura» y «Despachado», lo que fue saliendo y las facturas
 * cargadas. Las facturas (X mayorista, J educadores, C/B/X minorista) son lo
 * único que baja el stock real; «Despachado» solo cierra el pedido.
 */
export function PaginaDespacho() {
  const ventas = useVentas();
  const facturas = useFacturasX();
  const despachar = useDespacharPedidoReservado();
  // «Despachado» cierra el pedido: Ventas, Administración o Despacho. Naza solo carga facturas.
  const cierraPedidos = useTieneRol('VENTAS', 'ADMINISTRACION', 'DESPACHO');
  const [vista, setVista] = useState<Vista>('despachar');
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState<{ pedido: string | null } | null>(null);
  const [despachando, setDespachando] = useState<FilaVenta | null>(null);
  const [obs, setObs] = useState('');
  const [bajarStock, setBajarStock] = useState(false);

  const aprobados = useMemo(
    () => (ventas.data ?? []).filter((v) => APROBADO.includes(v.estado)),
    [ventas.data],
  );
  const facturasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of facturas.data ?? [])
      if (f.pedido_id && !f.anulada_en)
        m.set(f.pedido_id, [...(m.get(f.pedido_id) ?? []), f.numero]);
    return m;
  }, [facturas.data]);

  const pedidoDe = useMemo(
    () => new Map((ventas.data ?? []).map((v) => [v.id, v.numero])),
    [ventas.data],
  );
  const q = buscar.trim().toLowerCase();
  const filas = aprobados
    .filter((v) => (vista === 'despachar' ? !v.entregado_en : !!v.entregado_en))
    .filter(
      (v) =>
        !q ||
        v.cliente.toLowerCase().includes(q) ||
        v.numero.toLowerCase().includes(q) ||
        (facturasDe.get(v.id) ?? []).some((n) => n.includes(q)),
    )
    .sort((a, b) =>
      vista === 'despachar'
        ? (a.fecha_entrega ?? '').localeCompare(b.fecha_entrega ?? '')
        : (b.entregado_en ?? '').localeCompare(a.entregado_en ?? ''),
    );

  return (
    <>
      <EncabezadoPagina
        titulo="Despacho"
        descripcion="Las facturas son lo que salió de verdad: solo al cargarlas baja el stock. Mayorista (X con pedido), Educadores (J) y Minorista (C, B o X)."
        acciones={
          <Button
            size="md"
            leftSection={<IconFileInvoice size={20} />}
            onClick={() => setCargando({ pedido: null })}
          >
            Cargar factura
          </Button>
        }
      />
      <Group mb="md" gap="sm" wrap="wrap">
        <SegmentedControl
          size="md"
          value={vista}
          onChange={(v) => setVista(v as Vista)}
          data={[
            { value: 'despachar', label: 'Para despachar' },
            { value: 'historial', label: 'Pedidos despachados' },
            { value: 'facturas', label: 'Facturas cargadas' },
          ]}
        />
        <TextInput
          size="md"
          placeholder="Cliente, pedido o factura"
          leftSection={<IconSearch size={18} />}
          value={buscar}
          onChange={(e) => setBuscar(e.currentTarget.value)}
          aria-label="Buscar"
        />
      </Group>

      {vista === 'facturas' ? (
        <TablaFacturas
          facturas={(facturas.data ?? []).filter(
            (f) =>
              !q ||
              f.numero.includes(q) ||
              (f.cliente ?? '').toLowerCase().includes(q) ||
              (pedidoDe.get(f.pedido_id ?? '') ?? '').toLowerCase().includes(q),
          )}
          pedidoDe={pedidoDe}
          cargando={facturas.isLoading}
        />
      ) : ventas.isLoading ? (
        <Skeleton h={240} />
      ) : filas.length === 0 ? (
        <Vacio
          icono={IconTruckDelivery}
          titulo={
            vista === 'despachar'
              ? 'No hay pedidos para despachar'
              : 'Todavía no salió nada'
          }
          descripcion={
            vista === 'despachar'
              ? 'Acá aparecen los pedidos que Ventas aprobó.'
              : 'Acá quedan los pedidos despachados, con su factura X.'
          }
        />
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Pedido</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>{vista === 'despachar' ? 'Entrega' : 'Salió'}</Table.Th>
                  <Table.Th ta="right">Productos</Table.Th>
                  <Table.Th>Factura X</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((v) => {
                  const fx = facturasDe.get(v.id) ?? [];
                  return (
                    <Table.Tr key={v.id}>
                      <Table.Td fw={600}>{v.numero}</Table.Td>
                      <Table.Td>{v.cliente}</Table.Td>
                      <Table.Td>
                        {vista === 'despachar'
                          ? v.fecha_entrega
                            ? fecha(v.fecha_entrega)
                            : '—'
                          : v.entregado_en
                            ? fechaHora(v.entregado_en)
                            : '—'}
                      </Table.Td>
                      <Table.Td ta="right">{numero(v.productos)}</Table.Td>
                      <Table.Td>
                        {fx.length ? (
                          fx.join(', ')
                        ) : (
                          <Text size="sm" c="dimmed">
                            {vista === 'despachar' ? '—' : 'sin factura'}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            size="sm"
                            variant={fx.length ? 'default' : 'light'}
                            leftSection={<IconFileInvoice size={18} />}
                            onClick={() => setCargando({ pedido: v.id })}
                          >
                            Factura
                          </Button>
                          {vista === 'despachar' && cierraPedidos ? (
                            <Button
                              size="sm"
                              color="teal"
                              leftSection={<IconTruckDelivery size={18} />}
                              onClick={() => {
                                setObs('');
                                setBajarStock(false);
                                setDespachando(v);
                              }}
                            >
                              Despachado
                            </Button>
                          ) : null}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <CargarFacturaX
        abierto={cargando !== null}
        cerrar={() => setCargando(null)}
        pedidos={aprobados}
        pedidoInicial={cargando?.pedido ?? null}
      />

      <Modal
        opened={despachando !== null}
        onClose={() => setDespachando(null)}
        title={`Marcar ${despachando?.numero ?? ''} despachado`}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Cierra el pedido y libera lo reservado. No mueve stock: el stock baja cuando
            se carga la factura X.
          </Text>
          <Textarea
            label="Observación (opcional)"
            placeholder="Lo retiró el cliente, se mandó por expreso…"
            autosize
            minRows={2}
            value={obs}
            onChange={(e) => setObs(e.currentTarget.value)}
          />
          <Checkbox
            size="md"
            label="Bajar también el stock (ajuste de stock)"
            description="Por las dudas: baja lo reservado ahora, como antes. Si después se carga la factura X, corrige la diferencia sin descontar dos veces."
            checked={bajarStock}
            onChange={(e) => setBajarStock(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" size="md" onClick={() => setDespachando(null)}>
              Volver
            </Button>
            <Button
              size="md"
              color="teal"
              loading={despachar.isPending}
              onClick={() =>
                despachar.mutate(
                  { id: despachando!.id, observacion: obs.trim(), bajarStock },
                  { onSuccess: () => setDespachando(null) },
                )
              }
            >
              Despachado
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function TablaFacturas({
  facturas,
  pedidoDe,
  cargando,
}: {
  facturas: FacturaXCargada[];
  pedidoDe: Map<string, string>;
  cargando: boolean;
}) {
  // Anula quien puede cargar facturas (20261127150000).
  const anula = useTieneRol(
    'DESPACHO',
    'VENTAS',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
  );
  const anular = useAnularFactura();
  const [anulando, setAnulando] = useState<FacturaXCargada | null>(null);
  const [motivo, setMotivo] = useState('');
  if (cargando) return <Skeleton h={240} />;
  if (facturas.length === 0)
    return (
      <Vacio
        icono={IconFileInvoice}
        titulo="Todavía no hay facturas cargadas"
        descripcion="Acá quedan todas las facturas que bajaron stock: mayoristas, de educadores y minoristas."
      />
    );
  return (
    <Paper withBorder>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Factura</Table.Th>
              <Table.Th>Canal</Table.Th>
              <Table.Th>Cliente</Table.Th>
              <Table.Th>Pedido</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
              <Table.Th>Cargada</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {facturas.map((f) => (
              <Table.Tr key={f.id} opacity={f.anulada_en ? 0.6 : 1}>
                <Table.Td>{fecha(f.fecha)}</Table.Td>
                <Table.Td fw={600}>
                  {f.tipo} {f.numero}
                  {f.anulada_en ? (
                    <Text size="xs" c="red" fw={500}>
                      Anulada: {f.motivo_anulacion}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>{CANAL[f.canal]}</Table.Td>
                <Table.Td>{f.cliente ?? '—'}</Table.Td>
                <Table.Td>
                  {f.pedido_id ? (pedidoDe.get(f.pedido_id) ?? '—') : '—'}
                </Table.Td>
                <Table.Td ta="right">
                  {f.total === null ? '—' : `$${numero(f.total, 0)}`}
                </Table.Td>
                <Table.Td>{fechaHora(f.cargada_en)}</Table.Td>
                <Table.Td>
                  {f.anulada_en ? (
                    <Badge color="red" variant="light">
                      Anulada
                    </Badge>
                  ) : anula ? (
                    <Button
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        setMotivo('');
                        setAnulando(f);
                      }}
                    >
                      Anular
                    </Button>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Modal
        opened={!!anulando}
        onClose={() => setAnulando(null)}
        title={anulando ? `Anular la factura ${anulando.tipo} ${anulando.numero}` : ''}
      >
        <Stack>
          <Text size="sm">
            Lo que bajó del stock vuelve al depósito y la factura queda anulada (no se
            borra: queda quién, cuándo y por qué). Después la podés cargar de nuevo, bien.
          </Text>
          <Textarea
            label="Por qué se anula"
            placeholder="Ej.: era mayorista y se cargó como minorista"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            autosize
            minRows={2}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAnulando(null)}>
              Cancelar
            </Button>
            <Button
              color="red"
              disabled={!motivo.trim()}
              loading={anular.isPending}
              onClick={() =>
                anulando &&
                anular.mutate(
                  { id: anulando.id, motivo: motivo.trim() },
                  { onSuccess: () => setAnulando(null) },
                )
              }
            >
              Anular factura
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
