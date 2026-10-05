import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconSearch, IconShoppingCart } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { fecha, numero } from '@/lib/formato';
import {
  TEXTO_PAGO,
  useActualizarVenta,
  useVentas,
  type FilaVenta,
} from '@/lib/consultasVentas';

const pesos = (n: number) => `$${numero(n, 0)}`;
type Filtro = 'abiertos' | 'entregados' | 'todos';

/** Color de la fila, como en la planilla: verde entregado y pago, naranja con algo pendiente. */
function tono(v: FilaVenta): string | undefined {
  if (v.estado === 'BORRADOR') return undefined;
  if (v.entregado_en && v.estado_pago === 'PAGO')
    return 'var(--mantine-color-estadoAprobado-0)';
  if (v.a_producir > 0 || v.stock_ok === false || v.pendiente > 0)
    return 'var(--mantine-color-orange-0)';
  return undefined;
}

function Faltantes({ v }: { v: FilaVenta }) {
  if (v.estado === 'BORRADOR')
    return (
      <Text size="xs" c="dimmed">
        sin enviar
      </Text>
    );
  const partes: string[] = [];
  if (v.stock_ok === false) partes.push(`Calle 5: ${v.stock_nota ?? 'falta'}`);
  if (v.a_producir > 0 && v.pedido_stock)
    partes.push(`${numero(v.a_producir)} a producir (${v.pedido_stock})`);
  if (!partes.length && v.pendiente > 0 && !v.entregado_en) partes.push('por armar');
  return partes.length ? (
    <Text size="xs" c="orange.8" fw={600}>
      {partes.join(' · ')}
    </Text>
  ) : (
    <Text size="xs" c="dimmed">
      —
    </Text>
  );
}

/**
 * Central de pedidos de Ventas (pedido del 2026-10-01): la planilla PEDIDOS
 * MAYORISTAS con sus mismas columnas, pero con el monto, los faltantes y el
 * stock de Calle 5 calculados solos. Tocar una fila abre el pedido.
 */
export function PaginaVentas() {
  const ventas = useVentas();
  const actualizar = useActualizarVenta();
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('abiertos');

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (ventas.data ?? [])
      .filter((v) =>
        filtro === 'todos'
          ? true
          : filtro === 'entregados'
            ? Boolean(v.entregado_en)
            : !v.entregado_en && v.estado !== 'CANCELADO',
      )
      .filter(
        (v) =>
          !t ||
          [v.numero, v.cliente, v.destino_envio, v.observaciones, v.forma_pago]
            .filter(Boolean)
            .some((x) => x!.toLowerCase().includes(t)),
      );
  }, [ventas.data, texto, filtro]);

  return (
    <>
      <EncabezadoPagina
        titulo="Ventas"
        descripcion="Los pedidos mayoristas, como en la planilla. El monto, el descuento y lo que hay en Calle 5 salen solos."
        acciones={
          <Button
            component={Link}
            to="/ventas/nuevo"
            leftSection={<IconPlus size={18} />}
          >
            Nuevo pedido
          </Button>
        }
      />
      <Group mb="md" gap="sm" wrap="wrap">
        <TextInput
          placeholder="Buscar cliente, número, destino…"
          leftSection={<IconSearch size={16} />}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={320}
        />
        <SegmentedControl
          value={filtro}
          onChange={(v) => setFiltro(v as Filtro)}
          data={[
            { value: 'abiertos', label: 'Abiertos' },
            { value: 'entregados', label: 'Entregados' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
      </Group>
      {ventas.isLoading ? (
        <Skeleton h={320} radius="lg" />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconShoppingCart}
            titulo={texto ? 'Nada coincide con la búsqueda' : 'Todavía no hay pedidos'}
            descripcion="Cargá el primero con «Nuevo pedido»: es la lista de precios con una columna de cantidad."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          className="entrada"
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={1280}>
            <Table
              verticalSpacing={6}
              horizontalSpacing="xs"
              highlightOnHover
              stickyHeader
              fz="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Gestionado</Table.Th>
                  <Table.Th>Forma de pago</Table.Th>
                  <Table.Th>Fact.</Table.Th>
                  <Table.Th ta="right">Desc.</Table.Th>
                  <Table.Th>Faltantes</Table.Th>
                  <Table.Th>Observación</Table.Th>
                  <Table.Th>Pago</Table.Th>
                  <Table.Th>Destino</Table.Th>
                  <Table.Th ta="right">Importe con desc.</Table.Th>
                  <Table.Th>Stock</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((v, i) => (
                  <Table.Tr
                    key={v.id}
                    className="fila-tocable fila-resumen"
                    style={{ background: tono(v), '--i': Math.min(i, 12) }}
                    onClick={() => void navigate(`/ventas/${v.id}`)}
                  >
                    <Table.Td>
                      <Anchor
                        component={Link}
                        to={`/ventas/${v.id}`}
                        fw={700}
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {v.cliente}
                      </Anchor>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {v.numero}
                      </Text>
                    </Table.Td>
                    <Table.Td>{fecha(v.fecha).slice(0, 5)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate maw={110}>
                        {v.gestionado?.split(' ')[0] ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate maw={150}>
                        {v.forma_pago ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ff="monospace">
                      {v.factura_tipo ? (
                        <Tooltip
                          label={`${v.factura_tipo} ${String(v.factura_punto_venta).padStart(4, '0')}-${String(v.factura_numero).padStart(8, '0')}`}
                        >
                          <span>
                            {v.factura_tipo} {v.factura_numero}
                          </span>
                        </Tooltip>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(v.descuento_aplicado)} %
                    </Table.Td>
                    <Table.Td maw={220}>
                      <Faltantes v={v} />
                    </Table.Td>
                    <Table.Td maw={220}>
                      <Text size="xs" lineClamp={2}>
                        {v.observaciones ?? ''}
                      </Text>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Select
                        size="xs"
                        w={140}
                        allowDeselect={false}
                        value={v.estado_pago}
                        data={Object.entries(TEXTO_PAGO).map(([value, label]) => ({
                          value,
                          label,
                        }))}
                        onChange={(x) =>
                          x &&
                          actualizar.mutate({
                            id: v.id,
                            cambios: { estado_pago: x },
                          })
                        }
                        styles={{
                          input: {
                            fontWeight: 700,
                            color:
                              v.estado_pago === 'PAGO'
                                ? 'var(--mantine-color-estadoAprobado-8)'
                                : v.estado_pago === 'PARCIAL'
                                  ? 'var(--mantine-color-orange-8)'
                                  : 'var(--mantine-color-estadoRechazado-8)',
                          },
                        }}
                      />
                    </Table.Td>
                    <Table.Td maw={200}>
                      <Text size="xs" lineClamp={2}>
                        {v.destino_envio ?? ''}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {pesos(v.importe_total)}
                    </Table.Td>
                    <Table.Td>
                      {v.entregado_en ? (
                        <Badge color="estadoAprobado" variant="light">
                          entregado
                        </Badge>
                      ) : v.stock_ok === true ? (
                        <Badge color="estadoAprobado" variant="light">
                          hay ✓
                        </Badge>
                      ) : v.stock_ok === false ? (
                        <Badge color="orange" variant="light">
                          falta
                        </Badge>
                      ) : v.estado === 'BORRADOR' ? (
                        <Badge color="gray" variant="light">
                          borrador
                        </Badge>
                      ) : (
                        <Badge color="azul" variant="light">
                          a revisar
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </>
  );
}
