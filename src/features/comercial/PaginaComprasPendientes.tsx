import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconListCheck,
  IconShoppingCart,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { useInsumos, useProveedores } from '@/lib/consultas';
import { diasHasta, fecha, fechaHora, numero } from '@/lib/formato';
import {
  ROLES_ESCRIBEN_AVISOS,
  useAvisosCompra,
  useCambiarEstadoAviso,
  useNomina,
  type AvisoCompraRow,
} from '@/lib/consultasComercial';
import { BadgeEstadoAviso } from './estadoPedido';

type Vista = 'abiertas' | 'historial';

/**
 * Compras pendientes: lo que Producción anotó para comprar a partir de los
 * faltantes de los pedidos.
 *
 * La explosión de un pedido se recalcula cada vez que se abre; esto no. Es la
 * lista que se puede mirar el lunes para saber qué se le pidió a quién y qué
 * sigue sin pedir. El circuito es corto a propósito: por comprar → pedido al
 * proveedor → resuelto, o descartado con motivo.
 *
 * El mismo insumo puede aparecer para dos pedidos. No se suman solos porque
 * cada pedido se explotó contra el mismo disponible: la suma de los faltantes
 * puede exceder lo que hay que comprar. La pantalla muestra el total por insumo
 * para que quien compra lo vea junto, pero la cantidad la decide ella.
 */
export function PaginaComprasPendientes() {
  const avisos = useAvisosCompra();
  const insumos = useInsumos();
  const proveedores = useProveedores();
  const nomina = useNomina();
  const cambiar = useCambiarEstadoAviso();
  const puedeActuar = useTieneRol(...ROLES_ESCRIBEN_AVISOS);
  const { claims } = useSesion();
  const [vista, setVista] = useState<Vista>('abiertas');
  const [descartando, setDescartando] = useState<AvisoCompraRow | null>(null);
  const [motivo, setMotivo] = useState('');

  const insumoPorId = useMemo(
    () => new Map((insumos.data ?? []).map((i) => [i.id, i])),
    [insumos.data],
  );
  const proveedorPorId = useMemo(
    () => new Map((proveedores.data ?? []).map((p) => [p.id, p])),
    [proveedores.data],
  );

  const todos = avisos.data ?? [];
  const abiertas = todos.filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'EN_COMPRA',
  );
  const historial = todos.filter(
    (a) => a.estado === 'RESUELTO' || a.estado === 'DESCARTADO',
  );

  const vencidas = abiertas.filter((a) => {
    const d = diasHasta(a.fecha_limite);
    return d !== null && d < 0;
  }).length;

  // Total abierto por insumo, para avisar cuando el mismo insumo está anotado
  // para más de un pedido.
  const totalPorInsumo = new Map<string, { n: number; total: number }>();
  for (const a of abiertas) {
    const t = totalPorInsumo.get(a.insumo_id) ?? { n: 0, total: 0 };
    totalPorInsumo.set(a.insumo_id, { n: t.n + 1, total: t.total + Number(a.cantidad) });
  }

  const filas = (vista === 'abiertas' ? abiertas : historial).slice().sort((a, b) => {
    if (vista === 'historial') {
      return (b.resuelto_en ?? b.creado_en).localeCompare(a.resuelto_en ?? a.creado_en);
    }
    // Lo que vence antes, arriba; los sin fecha, al final.
    if (a.fecha_limite && b.fecha_limite)
      return a.fecha_limite.localeCompare(b.fecha_limite);
    if (a.fecha_limite) return -1;
    if (b.fecha_limite) return 1;
    return a.creado_en.localeCompare(b.creado_en);
  });

  function mover(a: AvisoCompraRow, estado: 'EN_COMPRA' | 'RESUELTO') {
    cambiar.mutate({ id: a.id, estado, usuarioId: claims?.usuario_id ?? null });
  }

  function descartar() {
    if (!descartando) return;
    cambiar.mutate(
      {
        id: descartando.id,
        estado: 'DESCARTADO',
        usuarioId: claims?.usuario_id ?? null,
        nota: motivo.trim(),
      },
      {
        onSuccess: () => {
          setDescartando(null);
          setMotivo('');
        },
      },
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Compras pendientes"
        descripcion="Lo que falta para cubrir los pedidos, anotado desde la ficha de cada uno."
        acciones={
          <Button component={Link} to="/pedidos" variant="default">
            Ver pedidos
          </Button>
        }
      />

      {avisos.isLoading ? (
        <Skeleton h={240} />
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <TarjetaIndicador
              etiqueta="Por comprar"
              valor={String(abiertas.filter((a) => a.estado === 'PENDIENTE').length)}
              icono={IconShoppingCart}
              detalle="Todavía no se le pidió al proveedor."
            />
            <TarjetaIndicador
              etiqueta="Pedido al proveedor"
              valor={String(abiertas.filter((a) => a.estado === 'EN_COMPRA').length)}
              icono={IconTruckDelivery}
              detalle="Esperando que llegue."
            />
            <TarjetaIndicador
              etiqueta="Pasadas de fecha"
              valor={String(vencidas)}
              icono={IconAlertTriangle}
              color={vencidas > 0 ? 'estadoRechazado' : 'violeta'}
              detalle="La entrega del pedido ya pasó y la compra sigue abierta."
            />
          </SimpleGrid>

          <SegmentedControl
            size="md"
            value={vista}
            onChange={(v) => setVista(v as Vista)}
            data={[
              { value: 'abiertas', label: `Abiertas (${abiertas.length})` },
              { value: 'historial', label: 'Historial' },
            ]}
            style={{ alignSelf: 'flex-start' }}
          />

          {filas.length === 0 ? (
            <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
              <Vacio
                icono={IconListCheck}
                titulo={
                  vista === 'abiertas' ? 'No hay compras pendientes' : 'Sin historial'
                }
                {...(vista === 'abiertas'
                  ? {
                      descripcion:
                        'Cuando un pedido tenga faltantes, se anotan desde su ficha y aparecen acá.',
                    }
                  : {})}
              />
            </Paper>
          ) : (
            <Paper
              withBorder
              style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
            >
              <Table.ScrollContainer minWidth={960}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Insumo</Table.Th>
                      <Table.Th ta="right">Cantidad</Table.Th>
                      <Table.Th>Proveedor sugerido</Table.Th>
                      <Table.Th>Para el pedido</Table.Th>
                      <Table.Th>A más tardar</Table.Th>
                      <Table.Th>Estado</Table.Th>
                      {vista === 'abiertas' && puedeActuar ? <Table.Th /> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filas.map((a) => {
                      const insumo = insumoPorId.get(a.insumo_id);
                      const proveedor = a.proveedor_id
                        ? proveedorPorId.get(a.proveedor_id)
                        : undefined;
                      const total = totalPorInsumo.get(a.insumo_id);
                      const dias = diasHasta(a.fecha_limite);
                      const abierta =
                        a.estado === 'PENDIENTE' || a.estado === 'EN_COMPRA';
                      return (
                        <Table.Tr key={a.id}>
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {insumo?.nombre ?? '(insumo)'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {insumo?.codigo_interno ?? ''}
                            </Text>
                            {abierta && total && total.n > 1 ? (
                              <Text size="xs" c="estadoEnAnalisis.8">
                                Anotado para {total.n} pedidos · {numero(total.total, 2)}{' '}
                                {a.unidad} en total
                              </Text>
                            ) : null}
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace" fw={700}>
                              {numero(a.cantidad, 2)} {a.unidad}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c={proveedor ? 'inherit' : 'dimmed'}>
                              {proveedor?.razon_social ?? 'Sin sugerido'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {a.pedido_id && a.pedido ? (
                              <>
                                <Text
                                  component={Link}
                                  to={`/pedidos/${a.pedido_id}`}
                                  size="sm"
                                  fw={600}
                                  c="violeta"
                                >
                                  {a.pedido.numero}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {a.pedido.cliente}
                                </Text>
                              </>
                            ) : (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text
                              size="sm"
                              c={
                                abierta && dias !== null && dias < 0
                                  ? 'estadoRechazado.7'
                                  : 'inherit'
                              }
                              fw={abierta && dias !== null && dias < 0 ? 700 : 400}
                            >
                              {a.fecha_limite
                                ? fecha(`${a.fecha_limite}T12:00:00`)
                                : 'Sin fecha'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <BadgeEstadoAviso estado={a.estado} />
                            {!abierta ? (
                              <Text size="xs" c="dimmed" mt={4}>
                                {fechaHora(a.resuelto_en)}
                                {a.resuelto_por && nomina.data?.get(a.resuelto_por)
                                  ? ` · ${nomina.data.get(a.resuelto_por)}`
                                  : ''}
                              </Text>
                            ) : null}
                            {a.nota ? (
                              <Text size="xs" c="dimmed" mt={2} maw={220}>
                                {a.nota}
                              </Text>
                            ) : null}
                          </Table.Td>
                          {vista === 'abiertas' && puedeActuar ? (
                            <Table.Td>
                              <Group gap="xs" wrap="nowrap" justify="flex-end">
                                {a.estado === 'PENDIENTE' ? (
                                  <Button
                                    size="sm"
                                    variant="light"
                                    leftSection={<IconTruckDelivery size={16} />}
                                    loading={
                                      cambiar.isPending && cambiar.variables?.id === a.id
                                    }
                                    onClick={() => mover(a, 'EN_COMPRA')}
                                  >
                                    Ya lo pedí
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="estadoAprobado"
                                    leftSection={<IconCheck size={16} />}
                                    loading={
                                      cambiar.isPending && cambiar.variables?.id === a.id
                                    }
                                    onClick={() => mover(a, 'RESUELTO')}
                                  >
                                    Resuelto
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="subtle"
                                  color="gray"
                                  onClick={() => setDescartando(a)}
                                >
                                  Descartar
                                </Button>
                              </Group>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}

          <Text size="xs" c="dimmed">
            Marcar «resuelto» no da entrada al stock: el material entra cuando se registra
            su recepción, con su lote y su circuito de calidad.
          </Text>
        </Stack>
      )}

      <Modal
        opened={descartando !== null}
        onClose={() => setDescartando(null)}
        title="Descartar la compra"
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm">
            La compra sale de la lista de pendientes y queda en el historial con el
            motivo.
          </Text>
          <Textarea
            label="Motivo"
            withAsterisk
            autosize
            minRows={2}
            placeholder="Por ejemplo: se canceló el pedido, o se cubrió con stock de otro depósito."
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setDescartando(null)}>
              Volver
            </Button>
            <Button
              color="red"
              disabled={motivo.trim().length < 5}
              loading={cambiar.isPending}
              onClick={descartar}
            >
              Descartar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
