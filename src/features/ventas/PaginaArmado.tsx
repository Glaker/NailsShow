import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import {
  IconBuildingStore,
  IconCheck,
  IconPackage,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useSesion } from '@/features/auth/sesion';
import { PaginaPuntoVenta } from '@/features/comercial/PaginaPuntoVenta';
import { fecha, numero } from '@/lib/formato';
import {
  agruparPorPedido,
  useCalle5,
  usePendientesDespacho,
  type PedidoADespachar,
} from '@/lib/consultasCalle5';
import { useEnviarArmado, useVentas, useVerificarStock } from '@/lib/consultasVentas';

/**
 * «Enviado»: arranca con lo pendiente de cada producto; se puede cambiar qué y
 * cuánto sale. Si sale distinto, pide el motivo: queda registrado qué se pedía
 * y qué salió. La base elige el lote de cada unidad (solo despachables).
 */
function ModalEnviado({
  pedido,
  onCerrar,
}: {
  pedido: PedidoADespachar | null;
  onCerrar: () => void;
}) {
  const enviar = useEnviarArmado();
  const [cant, setCant] = useState<Record<string, number | string>>({});
  const [motivo, setMotivo] = useState('');
  // Primero se elige: el pedido va completo o con faltantes (pedido del 2026-10-01).
  const [modo, setModo] = useState<'completo' | 'faltantes'>('completo');
  const renglones = (pedido?.renglones ?? []).filter((r) => Number(r.pendiente) > 0);
  const valor = (pid: string, pend: number) =>
    modo === 'faltantes' && pid in cant ? Number(cant[pid]) || 0 : pend;
  const distinto = renglones.some(
    (r) => valor(r.producto_id ?? '', Number(r.pendiente)) !== Number(r.pendiente),
  );
  const cerrar = () => {
    setCant({});
    setMotivo('');
    setModo('completo');
    onCerrar();
  };
  return (
    <Modal
      opened={pedido !== null}
      onClose={cerrar}
      title={pedido ? `Enviado · ${pedido.numero} · ${pedido.cliente}` : ''}
      size="lg"
      centered
    >
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          size="md"
          value={modo}
          onChange={(x) => setModo(x as 'completo' | 'faltantes')}
          data={[
            { value: 'completo', label: 'Va completo' },
            { value: 'faltantes', label: 'Va con faltantes' },
          ]}
        />
        <Table fz="md" verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Código</Table.Th>
              <Table.Th>Producto</Table.Th>
              <Table.Th ta="right">Pedido</Table.Th>
              <Table.Th w={120}>Sale</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {renglones.map((r) => {
              const pid = r.producto_id ?? '';
              const pend = Number(r.pendiente);
              return (
                <Table.Tr key={pid}>
                  <Table.Td ff="monospace" fw={800}>
                    {r.codigo_interno}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>
                      {r.producto}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace">
                    {numero(pend)}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      allowDecimal={false}
                      disabled={modo === 'completo'}
                      value={valor(pid, pend)}
                      onChange={(x) => setCant((c) => ({ ...c, [pid]: x }))}
                      error={valor(pid, pend) !== pend ? ' ' : undefined}
                      aria-label={`Sale de ${r.producto ?? ''}`}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {distinto ? (
          <Textarea
            label="¿Por qué sale distinto de lo pedido?"
            placeholder="Fallado, no hay, lo pidió el cliente…"
            autosize
            minRows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            required
          />
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={cerrar}>
            Volver
          </Button>
          <Button
            leftSection={<IconTruckDelivery size={18} />}
            loading={enviar.isPending}
            disabled={distinto && !motivo.trim()}
            onClick={() =>
              pedido &&
              enviar.mutate(
                {
                  id: pedido.pedido_id,
                  renglones: renglones
                    .map((r) => ({
                      producto_id: r.producto_id ?? '',
                      cantidad: valor(r.producto_id ?? '', Number(r.pendiente)),
                    }))
                    .filter((x) => x.cantidad > 0),
                  motivo: distinto ? motivo.trim() : null,
                },
                { onSuccess: cerrar },
              )
            }
          >
            Enviado
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** «Falta»: la encargada escribe qué no hay, y Ventas lo ve en la central. */
function ModalFalta({
  pedido,
  onCerrar,
}: {
  pedido: PedidoADespachar | null;
  onCerrar: () => void;
}) {
  const verificar = useVerificarStock();
  const [nota, setNota] = useState('');
  return (
    <Modal
      opened={pedido !== null}
      onClose={onCerrar}
      title={`Falta stock · ${pedido?.numero ?? ''}`}
      centered
    >
      <Stack gap="sm">
        <Textarea
          label="¿Qué falta?"
          placeholder="Ej.: del 101 hay 12, no 20. El 457 está fallado."
          autosize
          minRows={2}
          value={nota}
          onChange={(e) => setNota(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            color="orange"
            disabled={!nota.trim()}
            loading={verificar.isPending}
            onClick={() =>
              pedido &&
              verificar.mutate(
                { id: pedido.pedido_id, ok: false, nota: nota.trim() },
                {
                  onSuccess: () => {
                    setNota('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Avisar a Ventas
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PedidosAArmar() {
  const pendientes = usePendientesDespacho();
  const calle5 = useCalle5();
  const ventas = useVentas();
  const verificar = useVerificarStock();
  const [despachando, setDespachando] = useState<PedidoADespachar | null>(null);
  const [falta, setFalta] = useState<PedidoADespachar | null>(null);

  if (pendientes.isLoading || ventas.isLoading) return <Skeleton h={320} radius="lg" />;
  const pedidos = agruparPorPedido(pendientes.data ?? []);
  const venta = new Map((ventas.data ?? []).map((v) => [v.id, v]));
  const enC5 = new Map(
    (calle5.data ?? []).map((f) => [f.producto_id, Number(f.en_calle5 ?? 0)]),
  );

  if (pedidos.length === 0)
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio
          icono={IconPackage}
          titulo="No hay pedidos para armar"
          descripcion="Cuando Ventas envíe un pedido, aparece acá con lo que hay que preparar."
        />
      </Paper>
    );

  return (
    <>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {pedidos.map((p, i) => {
          const v = venta.get(p.pedido_id);
          return (
            <Paper
              key={p.pedido_id}
              withBorder
              p="md"
              radius="lg"
              className="contador"
              style={{ borderColor: 'var(--superficie-borde)', '--i': Math.min(i, 8) }}
            >
              <Group justify="space-between" align="flex-start" mb="xs" wrap="nowrap">
                <div>
                  <Title order={3} ff="monospace">
                    {p.numero}
                  </Title>
                  <Text fw={600}>{p.cliente}</Text>
                  {v?.destino_envio ? (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {v.destino_envio}
                    </Text>
                  ) : null}
                </div>
                <Stack gap={4} align="flex-end">
                  {p.fecha_entrega ? (
                    <Badge variant="light" color="indigo">
                      entrega {fecha(p.fecha_entrega).slice(0, 5)}
                    </Badge>
                  ) : null}
                  {v?.stock_ok === true ? (
                    <Badge color="estadoAprobado" variant="light">
                      hay ✓
                    </Badge>
                  ) : v?.stock_ok === false ? (
                    <Badge color="orange" variant="light">
                      falta
                    </Badge>
                  ) : null}
                </Stack>
              </Group>
              {v?.observaciones ? (
                <Text size="sm" mb="xs">
                  {v.observaciones}
                </Text>
              ) : null}
              <Table fz="md" verticalSpacing={4} mb="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Armar</Table.Th>
                    <Table.Th ta="right">En C5</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.renglones
                    .filter((r) => Number(r.pendiente) > 0)
                    .map((r) => {
                      const hay = enC5.get(r.producto_id ?? '') ?? 0;
                      return (
                        <Table.Tr key={r.producto_id}>
                          <Table.Td ff="monospace" fw={800}>
                            {r.codigo_interno}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" lineClamp={1}>
                              {r.producto}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right" ff="monospace" fw={800} fz="lg">
                            {numero(Number(r.pendiente))}
                          </Table.Td>
                          <Table.Td
                            ta="right"
                            ff="monospace"
                            c={
                              hay >= Number(r.pendiente) ? 'estadoAprobado.8' : 'orange.8'
                            }
                          >
                            {numero(hay)}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                </Table.Tbody>
              </Table>
              <Group gap="sm" grow>
                {v ? (
                  <>
                    <Button
                      variant="light"
                      color="estadoAprobado"
                      leftSection={<IconCheck size={18} />}
                      loading={verificar.isPending}
                      onClick={() =>
                        verificar.mutate({ id: p.pedido_id, ok: true, nota: null })
                      }
                    >
                      Hay
                    </Button>
                    <Button
                      variant="light"
                      color="orange"
                      leftSection={<IconX size={18} />}
                      onClick={() => setFalta(p)}
                    >
                      Falta
                    </Button>
                  </>
                ) : null}
                <Button
                  leftSection={<IconTruckDelivery size={18} />}
                  onClick={() => setDespachando(p)}
                >
                  Enviado
                </Button>
              </Group>
            </Paper>
          );
        })}
      </SimpleGrid>
      <ModalEnviado pedido={despachando} onCerrar={() => setDespachando(null)} />
      <ModalFalta pedido={falta} onCerrar={() => setFalta(null)} />
    </>
  );
}

/**
 * Pedidos a armar (pedido del 2026-10-01): lo único que ve la encargada de
 * Calle 5. Cada pedido con el código y la cantidad a preparar, el visto bueno
 * de stock («Hay» / «Falta») y «Enviado», que despacha, descuenta el stock y
 * registra el lote de cada unidad (se puede cambiar qué y cuánto sale, con motivo). La otra pestaña es el stock de Calle 5,
 * para contar, sumar lo que entra o sacar lo fallado.
 */
export function PaginaArmado() {
  const { claims } = useSesion();
  const [pestania, setPestania] = useState<string | null>('armar');
  const nombre = claims?.nombre?.split(' ')[0] ?? '';
  return (
    <>
      <div className="saludo" style={{ marginBottom: 'var(--mantine-spacing-lg)' }}>
        <Title order={1}>Hola{nombre ? `, ${nombre}` : ''}</Title>
        <Text c="dimmed" size="lg">
          Estos son los pedidos para armar.
        </Text>
      </div>
      <Tabs value={pestania} onChange={setPestania} color="azul" keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="armar" leftSection={<IconPackage size={18} />}>
            Pedidos a armar
          </Tabs.Tab>
          <Tabs.Tab value="stock" leftSection={<IconBuildingStore size={18} />}>
            Stock de Calle 5
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="armar">
          <PedidosAArmar />
        </Tabs.Panel>
        <Tabs.Panel value="stock">
          <PaginaPuntoVenta />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
