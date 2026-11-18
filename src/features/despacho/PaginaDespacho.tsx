import { useMemo, useState } from 'react';
import {
  Button,
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
import { useDespacharPedidoReservado, useVentas, type FilaVenta } from '@/lib/consultasVentas';
import { useFacturasX } from '@/lib/consultasDespacho';
import { CargarFacturaX } from './CargarFacturaX';

type Vista = 'despachar' | 'historial';
const APROBADO = ['CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO'];

/**
 * Despacho (D-factura-x-1, pedido del 2026-11-18): los pedidos aprobados que
 * esperan salir, con «Cargar factura X» y «Despachado», y el historial de lo
 * que fue saliendo. La factura X es lo que salió de verdad: baja el stock.
 */
export function PaginaDespacho() {
  const ventas = useVentas();
  const facturas = useFacturasX();
  const despachar = useDespacharPedidoReservado();
  const [vista, setVista] = useState<Vista>('despachar');
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState<{ pedido: string | null } | null>(null);
  const [despachando, setDespachando] = useState<FilaVenta | null>(null);
  const [obs, setObs] = useState('');

  const aprobados = useMemo(
    () => (ventas.data ?? []).filter((v) => APROBADO.includes(v.estado)),
    [ventas.data],
  );
  const facturasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of facturas.data ?? []) m.set(f.pedido_id, [...(m.get(f.pedido_id) ?? []), f.numero]);
    return m;
  }, [facturas.data]);

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
        descripcion="La factura X es lo que salió de verdad: al cargarla baja el stock y lo que no se mandó vuelve a quedar libre."
        acciones={
          <Button
            size="md"
            leftSection={<IconFileInvoice size={20} />}
            onClick={() => setCargando({ pedido: null })}
          >
            Cargar factura X
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
            { value: 'historial', label: 'Historial' },
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

      {ventas.isLoading ? (
        <Skeleton h={240} />
      ) : filas.length === 0 ? (
        <Vacio
          icono={IconTruckDelivery}
          titulo={vista === 'despachar' ? 'No hay pedidos para despachar' : 'Todavía no salió nada'}
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
                            Factura X
                          </Button>
                          {vista === 'despachar' ? (
                            <Button
                              size="sm"
                              color="teal"
                              leftSection={<IconTruckDelivery size={18} />}
                              onClick={() => {
                                setObs('');
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
            Sale del stock lo que el pedido tiene reservado y queda entregado. Si después cargás
            la factura X, corrige contra lo que salió.
          </Text>
          <Textarea
            label="Observación (opcional)"
            placeholder="Lo retiró el cliente, se mandó por expreso…"
            autosize
            minRows={2}
            value={obs}
            onChange={(e) => setObs(e.currentTarget.value)}
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
                  { id: despachando!.id, observacion: obs.trim() },
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
