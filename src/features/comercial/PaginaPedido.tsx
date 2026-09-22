import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
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
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useProductos } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import {
  useAgregarRenglonPedido,
  useCambiarEstadoPedido,
  useFaltantesPedido,
  usePedido,
  useRenglonesPedido,
  type EstadoPedido,
} from '@/lib/consultasComercial';
import { BadgeEstadoPedido } from './PaginaPedidos';

/**
 * Detalle de un pedido, con la respuesta a «¿se puede fabricar?».
 *
 * `comercial.explotar_pedido()` devuelve solo los faltantes. Una lista vacía es
 * la buena noticia, y por eso la pantalla la traduce a un cartel explícito en
 * vez de mostrar una tabla sin filas: nadie lee «0 resultados» como «sí».
 */
export function PaginaPedido() {
  const { id } = useParams<{ id: string }>();
  const pedido = usePedido(id);
  const renglones = useRenglonesPedido(id);
  const faltantes = useFaltantesPedido(id);
  const productos = useProductos();
  const agregar = useAgregarRenglonPedido();
  const cambiarEstado = useCambiarEstadoPedido();

  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | ''>('');

  const sinRenglones = (renglones.data ?? []).length === 0;
  const listoParaFabricar =
    !faltantes.isLoading && (faltantes.data ?? []).length === 0 && !sinRenglones;

  if (pedido.isLoading) return <Skeleton h={320} />;
  if (!pedido.data) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio icono={IconPackage} titulo="No se encontró el pedido" />
      </Paper>
    );
  }

  const p = pedido.data;

  return (
    <>
      <EncabezadoPagina
        titulo={`Pedido ${p.numero}`}
        descripcion={`${p.cliente}${p.fecha_entrega ? ` · entrega ${p.fecha_entrega}` : ''}`}
        acciones={
          <Group gap="sm">
            <BadgeEstadoPedido estado={p.estado} />
            <Select
              w={180}
              aria-label="Estado del pedido"
              data={[
                { value: 'BORRADOR', label: 'Borrador' },
                { value: 'CONFIRMADO', label: 'Confirmado' },
                { value: 'EN_PRODUCCION', label: 'En producción' },
                { value: 'CUMPLIDO', label: 'Cumplido' },
                { value: 'CANCELADO', label: 'Cancelado' },
              ]}
              value={p.estado}
              onChange={(v) =>
                v ? cambiarEstado.mutate({ id: p.id, estado: v as EstadoPedido }) : null
              }
            />
          </Group>
        }
      />

      <Stack gap="lg">
        {/* ---------------- Qué se pidió ---------------- */}
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Stack gap="md">
            <Text fw={600}>Productos del pedido</Text>

            {renglones.isLoading ? (
              <Skeleton h={80} />
            ) : sinRenglones ? (
              <Text size="sm" c="dimmed">
                Todavía no hay productos en este pedido. Agregá el primero para ver qué
                hace falta.
              </Text>
            ) : (
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(renglones.data ?? []).map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text size="sm">{r.producto?.nombre ?? '(producto)'}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" fw={600}>
                          {numero(r.cantidad, 0)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            <Group align="flex-end" wrap="wrap" gap="sm">
              <Select
                label="Agregar producto"
                placeholder="Elegí un producto"
                searchable
                nothingFoundMessage="Sin coincidencias"
                style={{ flex: 1, minWidth: 240 }}
                data={(productos.data ?? []).map((x) => ({
                  value: x.id,
                  label: x.nombre,
                }))}
                value={productoId}
                onChange={setProductoId}
              />
              <NumberInput
                label="Cantidad"
                min={1}
                hideControls
                w={140}
                value={cantidad}
                onChange={(v) => setCantidad(typeof v === 'number' ? v : '')}
              />
              <Button
                disabled={!productoId || typeof cantidad !== 'number' || cantidad <= 0}
                loading={agregar.isPending}
                onClick={() => {
                  if (!productoId || typeof cantidad !== 'number' || !id) return;
                  agregar.mutate(
                    { pedidoId: id, productoId, cantidad },
                    {
                      onSuccess: () => {
                        setProductoId(null);
                        setCantidad('');
                      },
                    },
                  );
                }}
              >
                Agregar
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* ---------------- ¿Se puede fabricar? ---------------- */}
        {sinRenglones ? null : faltantes.isLoading ? (
          <Skeleton h={160} />
        ) : listoParaFabricar ? (
          <Alert
            color="estadoAprobado"
            variant="light"
            radius="md"
            icon={<IconCheck size={18} />}
            title="Se puede fabricar con el stock que hay"
          >
            Todos los materiales de acondicionamiento de este pedido están disponibles y
            sin reservar por otro pedido. El granel se calcula aparte, con la fórmula de
            fabricación.
          </Alert>
        ) : (
          <FaltantesDePedido filas={faltantes.data ?? []} />
        )}
      </Stack>
    </>
  );
}

function FaltantesDePedido({
  filas,
}: {
  filas: NonNullable<ReturnType<typeof useFaltantesPedido>['data']>;
}) {
  const sinProveedor = filas.filter((f) => !f.proveedor_id).length;

  return (
    <Stack gap="md">
      <Group grow wrap="wrap">
        <TarjetaIndicador
          etiqueta="Insumos que faltan"
          valor={String(filas.length)}
          icono={IconShoppingCart}
          detalle="Solo se listan los que no alcanzan."
        />
        {sinProveedor > 0 ? (
          <TarjetaIndicador
            etiqueta="Sin proveedor sugerido"
            valor={String(sinProveedor)}
            icono={IconAlertTriangle}
            detalle="No hay compra previa registrada de ese insumo."
          />
        ) : null}
      </Group>

      <Alert
        color="estadoEnAnalisis"
        variant="light"
        radius="md"
        icon={<IconAlertTriangle size={18} />}
        title="Falta material para cubrir este pedido"
      >
        El disponible ya descuenta lo que está en cuarentena, lo bloqueado y lo reservado
        por otros pedidos.
      </Alert>

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th ta="right">Necesario</Table.Th>
                <Table.Th ta="right">Disponible</Table.Th>
                <Table.Th ta="right">Falta</Table.Th>
                <Table.Th>Proveedor sugerido</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => (
                <Table.Tr key={f.insumo_id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {f.insumo}
                    </Text>
                    {f.codigo_interno ? (
                      <Text size="xs" c="dimmed">
                        {f.codigo_interno}
                        {f.unidad ? ` · ${f.unidad}` : ''}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" ff="monospace">
                      {numero(f.necesario, 2)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" ff="monospace" c="dimmed">
                      {numero(f.disponible, 2)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" ff="monospace" fw={700} c="estadoRechazado.7">
                      {numero(f.faltante, 2)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {f.proveedor ? (
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">{f.proveedor}</Text>
                        {f.proveedor_estado && f.proveedor_estado !== 'APROBADO' ? (
                          <Tooltip
                            label={`Proveedor ${f.proveedor_estado.toLowerCase()}`}
                          >
                            <Badge color="estadoEnAnalisis" variant="light" radius="sm">
                              {f.proveedor_estado}
                            </Badge>
                          </Tooltip>
                        ) : null}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Sin compra previa registrada
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}
