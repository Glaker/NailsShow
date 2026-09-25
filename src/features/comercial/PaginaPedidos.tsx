import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconClipboardList, IconListCheck, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha } from '@/lib/formato';
import {
  ROLES_ESCRIBEN_PEDIDOS,
  useAvisosCompra,
  useNomina,
  usePedidos,
  type EstadoPedido,
  type PedidoConConteoRow,
} from '@/lib/consultasComercial';
import { BadgeEntrega, BadgeEstadoPedido } from './estadoPedido';
import { FormularioPedido } from './FormularioPedido';
import { FaltantesConsolidados } from './FaltantesConsolidados';
import { TableroPedidos, BadgePara } from './TableroPedidos';
import { useTerceros } from '@/lib/consultasTercerizados';

type Vista = 'tablero' | 'revisar' | 'produccion' | 'borradores' | 'cerrados';

const ESTADOS_DE_VISTA: Record<Vista, EstadoPedido[]> = {
  tablero: ['CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO'],
  revisar: ['CONFIRMADO'],
  produccion: ['EN_PRODUCCION'],
  borradores: ['BORRADOR'],
  cerrados: ['CUMPLIDO', 'CANCELADO'],
};

const DESCRIPCION_VISTA: Record<Vista, string> = {
  tablero:
    'Todo lo que está en curso, de Nail Show y de los tercerizados, de un vistazo. Tocá una tarjeta para abrir el pedido.',
  revisar:
    'Enviados a producción y todavía sin tomar. Abrí cada uno para ver si alcanza el material o hay que comprar.',
  produccion: 'Pedidos que Producción ya tomó y está fabricando.',
  borradores: 'Cargados pero no enviados. Producción todavía no los ve como pendientes.',
  cerrados: 'Terminados y cancelados.',
};

function esVista(v: string | null): v is Vista {
  return (
    v === 'tablero' ||
    v === 'revisar' ||
    v === 'produccion' ||
    v === 'borradores' ||
    v === 'cerrados'
  );
}

/** Lo más urgente arriba: por entrega, y los sin fecha al final. */
function porEntrega(a: PedidoConConteoRow, b: PedidoConConteoRow) {
  if (a.fecha_entrega && b.fecha_entrega)
    return a.fecha_entrega.localeCompare(b.fecha_entrega);
  if (a.fecha_entrega) return -1;
  if (b.fecha_entrega) return 1;
  return b.creado_en.localeCompare(a.creado_en);
}

/**
 * Bandeja de pedidos.
 *
 * La usan dos personas con preguntas distintas: quien carga los pedidos
 * (Administración) arma borradores y los envía; Gerencia de Producción recibe
 * los enviados y decide si hay que comprar. Por eso la vista inicial depende
 * del rol, y la vista elegida queda en la URL para poder pasar el enlace.
 *
 * El listado no calcula la cobertura de stock: eso es una explosión por pedido
 * contra el disponible, y correrla para todos sería una consulta por fila. La
 * cobertura se ve al abrir el pedido.
 */
export function PaginaPedidos() {
  const pedidos = usePedidos();
  const avisos = useAvisosCompra();
  const nomina = useNomina();
  const navigate = useNavigate();
  const puedeCargar = useTieneRol(...ROLES_ESCRIBEN_PEDIDOS);
  const esProduccion = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const [params, setParams] = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const angosta = useMediaQuery('(max-width: 36em)');
  const terceros = useTerceros();
  const terceroPorId = new Map((terceros.data ?? []).map((t) => [t.id, t]));

  const vistaUrl = params.get('vista');
  const vista: Vista = esVista(vistaUrl)
    ? vistaUrl
    : !esProduccion && puedeCargar
      ? 'borradores'
      : 'tablero';

  const todos = pedidos.data ?? [];
  const cuenta = (v: Vista) =>
    todos.filter((p) => ESTADOS_DE_VISTA[v].includes(p.estado)).length;
  const filas = todos
    .filter((p) => ESTADOS_DE_VISTA[vista].includes(p.estado))
    .sort(vista === 'cerrados' ? (a, b) => b.fecha.localeCompare(a.fecha) : porEntrega);

  const comprasAbiertas = (avisos.data ?? []).filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'EN_COMPRA',
  ).length;

  const etiqueta = (texto: string, n: number) => (n > 0 ? `${texto} (${n})` : texto);

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion="Se cargan acá, Producción los revisa contra el stock, y lo que falta queda anotado en compras."
        acciones={
          <Group gap="sm">
            <Button
              component={Link}
              to="/compras"
              variant="default"
              leftSection={<IconListCheck size={16} />}
              rightSection={
                comprasAbiertas > 0 ? (
                  <Badge color="estadoEnAnalisis" variant="filled" radius="sm" size="sm">
                    {comprasAbiertas}
                  </Badge>
                ) : null
              }
            >
              Compras pendientes
            </Button>
            {puedeCargar ? (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setAbierto(true)}
              >
                Nuevo pedido
              </Button>
            ) : null}
          </Group>
        }
      />

      {pedidos.isLoading ? (
        <Skeleton h={220} />
      ) : todos.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconClipboardList}
            titulo="No hay pedidos cargados"
            descripcion="Cargá el primer pedido para ver qué hace falta comprar y qué se puede fabricar ya."
            accion={
              puedeCargar ? (
                <Button onClick={() => setAbierto(true)}>Nuevo pedido</Button>
              ) : undefined
            }
          />
        </Paper>
      ) : (
        <Stack gap="md">
          <FaltantesConsolidados
            hayEnCurso={cuenta('revisar') + cuenta('produccion') > 0}
          />
          <SegmentedControl
            fullWidth
            orientation={angosta ? 'vertical' : 'horizontal'}
            size="md"
            value={vista}
            onChange={(v) => setParams({ vista: v }, { replace: true })}
            data={[
              { value: 'tablero', label: 'Tablero' },
              { value: 'revisar', label: etiqueta('Para revisar', cuenta('revisar')) },
              {
                value: 'produccion',
                label: etiqueta('En producción', cuenta('produccion')),
              },
              {
                value: 'borradores',
                label: etiqueta('Borradores', cuenta('borradores')),
              },
              { value: 'cerrados', label: 'Cerrados' },
            ]}
          />
          <Text size="sm" c="dimmed">
            {DESCRIPCION_VISTA[vista]}
          </Text>

          {vista === 'tablero' ? (
            <TableroPedidos pedidos={todos} terceros={terceroPorId} />
          ) : filas.length === 0 ? (
            <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
              <Vacio icono={IconClipboardList} titulo="Nada en esta bandeja" />
            </Paper>
          ) : (
            <Paper
              withBorder
              style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
            >
              <Table.ScrollContainer minWidth={760}>
                <Table verticalSpacing="md" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Número</Table.Th>
                      <Table.Th>Cliente</Table.Th>
                      <Table.Th ta="right">Productos</Table.Th>
                      <Table.Th>Cargado</Table.Th>
                      <Table.Th>Entrega</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filas.map((p) => {
                      const abiertoPedido =
                        p.estado !== 'CUMPLIDO' && p.estado !== 'CANCELADO';
                      return (
                        <Table.Tr
                          key={p.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => void navigate(`/pedidos/${p.id}`)}
                        >
                          <Table.Td>
                            <Text
                              component={Link}
                              to={`/pedidos/${p.id}`}
                              fw={600}
                              size="sm"
                              c="violeta"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {p.numero}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={6} wrap="nowrap">
                              <BadgePara
                                tercero={
                                  p.tercero_id ? terceroPorId.get(p.tercero_id) : null
                                }
                                paraStock={p.para_stock}
                              />
                              <Text size="sm">{p.cliente}</Text>
                            </Group>
                            {p.observaciones ? (
                              <Text size="xs" c="dimmed" lineClamp={1} maw={280}>
                                {p.observaciones}
                              </Text>
                            ) : null}
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace">
                              {p.renglones[0]?.count ?? 0}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{fecha(p.creado_en)}</Text>
                            <Text size="xs" c="dimmed">
                              {nomina.data?.get(p.creado_por) ?? ''}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <BadgeEntrega
                              fechaEntrega={p.fecha_entrega}
                              abierto={abiertoPedido}
                            />
                          </Table.Td>
                          <Table.Td>
                            <BadgeEstadoPedido estado={p.estado} />
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}
        </Stack>
      )}

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title="Nuevo pedido"
        size="lg"
        centered
        radius="md"
      >
        {abierto ? (
          <FormularioPedido pedidos={todos} onCerrar={() => setAbierto(false)} />
        ) : null}
      </Modal>
    </>
  );
}
