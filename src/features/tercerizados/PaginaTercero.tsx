import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconClipboardList,
  IconMinus,
  IconPackage,
  IconPencil,
  IconPlus,
  IconScale,
  IconSettings,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { useTieneRol } from '@/features/auth/sesion';
import { BadgeEntrega, BadgeEstadoPedido } from '@/features/comercial/estadoPedido';
import { FormularioPedido } from '@/features/comercial/FormularioPedido';
import { FormularioMovimiento } from '@/features/stock/FormularioMovimiento';
import { useProductos, type ExistenciaLote } from '@/lib/consultas';
import { ROLES_ESCRIBEN_PEDIDOS, usePedidos } from '@/lib/consultasComercial';
import { fecha, numero } from '@/lib/formato';
import {
  ROLES_ALTA_TERCERO,
  ROLES_STOCK_TERCERO,
  colorTercero,
  useExistenciasTercero,
  useFaltantesTercero,
  useStockTercero,
  useTerceros,
  type Tercero,
} from '@/lib/consultasTercerizados';
import { EntornoTercerizados } from './EntornoTercerizados';
import { FormularioTercero } from './FormularioTercero';
import { FormularioProductoTercero } from './FormularioProductoTercero';
import { IngresarStockTercero } from './IngresarStockTercero';
import { PanelReservas } from './PanelReservas';

const u = (unidad: string | null) => (unidad === 'UNIDAD' ? 'u' : (unidad ?? ''));

/**
 * Ficha de un cliente tercerizado: sus pedidos, su stock, sus productos y lo
 * que se le fabricó. Todo lo del cliente en un lugar, simple.
 */
export function PaginaTercero() {
  const { id } = useParams<{ id: string }>();
  const terceros = useTerceros();
  const puedeEditar = useTieneRol(...ROLES_ALTA_TERCERO);
  const [editando, setEditando] = useState(false);
  const [pestana, setPestana] = useState<string | null>('pedidos');

  const tercero = (terceros.data ?? []).find((t) => t.id === id);
  if (terceros.isLoading) return <Skeleton h={320} />;
  if (!tercero) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio icono={IconPackage} titulo="No se encontró el cliente tercerizado" />
      </Paper>
    );
  }
  const color = colorTercero(tercero);

  return (
    <EntornoTercerizados
      titulo={tercero.nombre}
      descripcion={tercero.observaciones ?? undefined}
      color={color}
      acciones={
        <Group gap="sm">
          <Button
            component={Link}
            to="/tercerizados"
            variant="white"
            color="dark"
            leftSection={<IconArrowLeft size={16} />}
          >
            Todos los clientes
          </Button>
          {puedeEditar ? (
            <Button
              variant="default"
              leftSection={<IconPencil size={16} />}
              onClick={() => setEditando(true)}
            >
              Editar
            </Button>
          ) : null}
        </Group>
      }
    >
      <Tabs
        value={pestana}
        onChange={setPestana}
        color={color}
        variant="pills"
        radius="md"
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="pedidos" leftSection={<IconClipboardList size={18} />}>
            Pedidos
          </Tabs.Tab>
          <Tabs.Tab value="stock" leftSection={<IconScale size={18} />}>
            Stock
          </Tabs.Tab>
          <Tabs.Tab value="productos" leftSection={<IconPackage size={18} />}>
            Productos
          </Tabs.Tab>
          <Tabs.Tab value="produccion" leftSection={<IconSettings size={18} />}>
            Producción
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pedidos">
          <PestanaPedidos tercero={tercero} />
        </Tabs.Panel>
        <Tabs.Panel value="stock">
          <PestanaStock tercero={tercero} />
        </Tabs.Panel>
        <Tabs.Panel value="productos">
          <PestanaProductos tercero={tercero} />
        </Tabs.Panel>
        <Tabs.Panel value="produccion">
          <PestanaProduccion tercero={tercero} />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={editando}
        onClose={() => setEditando(false)}
        title="Editar cliente"
        centered
        radius="md"
      >
        {editando ? (
          <FormularioTercero tercero={tercero} onListo={() => setEditando(false)} />
        ) : null}
      </Modal>
    </EntornoTercerizados>
  );
}

/* ------------------------------------------------------------------------- */

function PestanaPedidos({ tercero }: { tercero: Tercero }) {
  const pedidos = usePedidos();
  const faltantes = useFaltantesTercero(tercero.id);
  const puedeCargar = useTieneRol(...ROLES_ESCRIBEN_PEDIDOS);
  const [nuevo, setNuevo] = useState(false);
  const navigate = useNavigate();

  const todos = pedidos.data ?? [];
  const abiertos = todos
    .filter(
      (p) =>
        p.tercero_id === tercero.id &&
        p.estado !== 'CUMPLIDO' &&
        p.estado !== 'CANCELADO',
    )
    .sort((a, b) => (a.fecha_entrega ?? '9999').localeCompare(b.fecha_entrega ?? '9999'));
  const falta = faltantes.data ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Pedidos abiertos</Text>
        {puedeCargar ? (
          <Button
            color="indigo"
            leftSection={<IconPlus size={16} />}
            onClick={() => setNuevo(true)}
          >
            Nuevo pedido
          </Button>
        ) : null}
      </Group>

      {falta.length > 0 ? (
        <Alert
          color="estadoRechazado"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
          title={`Para los pedidos en curso, ${tercero.nombre} tiene que traer:`}
        >
          <Stack gap={2}>
            {falta.map((f) => (
              <Text key={f.insumo_id} size="sm">
                <b>{f.insumo}</b>: faltan {numero(Number(f.faltante), 2)} {u(f.unidad)}{' '}
                (hay {numero(Number(f.disponible), 2)} aprobado)
              </Text>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {pedidos.isLoading ? (
        <Skeleton h={120} />
      ) : abiertos.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio icono={IconClipboardList} titulo="No hay pedidos abiertos" />
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {abiertos.map((p) => (
            <Paper
              key={p.id}
              withBorder
              p="md"
              radius="md"
              className="cuadrito-tercero"
              style={{ borderColor: 'var(--superficie-borde)' }}
              onClick={() => void navigate(`/pedidos/${p.id}`)}
            >
              <Group justify="space-between" mb={6}>
                <Text fw={800} fz={18}>
                  {p.numero}
                </Text>
                <BadgeEstadoPedido estado={p.estado} />
              </Group>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {p.renglones[0]?.count ?? 0} productos · entrega
                </Text>
                <BadgeEntrega fechaEntrega={p.fecha_entrega} abierto />
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      )}

      <Modal
        opened={nuevo}
        onClose={() => setNuevo(false)}
        title={`Nuevo pedido de ${tercero.nombre}`}
        size="lg"
        centered
        radius="md"
      >
        {nuevo ? (
          <FormularioPedido
            pedidos={todos}
            terceroInicial={tercero.id}
            onCerrar={() => setNuevo(false)}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

/* ------------------------------------------------------------------------- */

function PestanaStock({ tercero }: { tercero: Tercero }) {
  const stock = useStockTercero(tercero.id);
  const lotes = useExistenciasTercero(tercero.id);
  const puede = useTieneRol(...ROLES_STOCK_TERCERO);
  const [ingresando, setIngresando] = useState(false);
  const [quitando, setQuitando] = useState<ExistenciaLote | null>(null);

  const filas = (stock.data ?? []).filter((s) => Number(s.saldo_total) > 0);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={600}>Stock de {tercero.nombre}</Text>
          <Text size="xs" c="dimmed">
            Aparte del de Nail Show. Lo que entra queda en cuarentena hasta que Calidad lo
            apruebe.
          </Text>
        </div>
        {puede ? (
          <Button
            size="md"
            color="indigo"
            leftSection={<IconTruckDelivery size={18} />}
            onClick={() => setIngresando(true)}
          >
            Agregar stock
          </Button>
        ) : null}
      </Group>

      {stock.isLoading ? (
        <Skeleton h={160} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconScale}
            titulo="Sin stock cargado"
            descripcion="Cuando el cliente traiga material, cargalo con «Agregar stock»."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th ta="right">Hay</Table.Th>
                  <Table.Th ta="right">Por aprobar / no usable</Table.Th>
                  <Table.Th ta="right">Reservado</Table.Th>
                  <Table.Th ta="right">Disponible</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((s) => (
                  <Table.Tr key={s.insumo_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {s.insumo_nombre}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {s.codigo_interno}
                        {s.propio ? '' : ' · del catálogo de Nail Show'}
                        {s.vence_primero
                          ? ` · vence ${fecha(`${s.vence_primero}T12:00:00`)}`
                          : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {numero(Number(s.saldo_total), 2)} {u(s.unidad_medida)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text
                        size="sm"
                        ff="monospace"
                        c={
                          Number(s.saldo_no_disponible) > 0
                            ? 'estadoCuarentena.9'
                            : 'dimmed'
                        }
                      >
                        {numero(Number(s.saldo_no_disponible), 2)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" c="dimmed">
                        {numero(Number(s.reservado), 2)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" fw={700}>
                        {numero(Number(s.disponible), 2)} {u(s.unidad_medida)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {(lotes.data ?? []).length > 0 ? (
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Text fw={600} mb="xs">
            Por lote
          </Text>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th>Lote</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Depósito</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(lotes.data ?? []).map((l) => (
                  <Table.Tr key={`${l.lote_insumo_id}-${l.deposito_id}`}>
                    <Table.Td>
                      <Text size="sm">{l.insumo_nombre}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor
                        component={Link}
                        to={`/lotes/${l.lote_insumo_id}`}
                        size="sm"
                      >
                        {l.numero_registro_interno}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {l.lote_proveedor}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {l.estado ? <InsigniaEstado estado={l.estado} /> : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{l.deposito_numero}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {numero(Number(l.saldo), 2)} {u(l.unidad)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {puede ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconMinus size={14} />}
                          onClick={() => setQuitando(l)}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      ) : null}

      <PanelReservas titular={tercero} />

      <Modal
        opened={ingresando}
        onClose={() => setIngresando(false)}
        title={`Agregar stock de ${tercero.nombre}`}
        size="xl"
        centered
        radius="md"
      >
        {ingresando ? (
          <IngresarStockTercero tercero={tercero} onListo={() => setIngresando(false)} />
        ) : null}
      </Modal>
      <Modal
        opened={quitando !== null}
        onClose={() => setQuitando(null)}
        title="Quitar stock"
        centered
        radius="md"
      >
        {quitando ? (
          <FormularioMovimiento
            posicion={quitando}
            tipoInicial="SALIDA_DESCARTE"
            onListo={() => setQuitando(null)}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

/* ------------------------------------------------------------------------- */

function PestanaProductos({ tercero }: { tercero: Tercero }) {
  const productos = useProductos();
  const puede = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const [alta, setAlta] = useState(false);
  const navigate = useNavigate();

  const todos = productos.data ?? [];
  const suyos = todos.filter((p) => p.tercero_id === tercero.id);
  const nombre = new Map(todos.map((p) => [p.id, `${p.codigo_interno} · ${p.nombre}`]));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600}>Productos de {tercero.nombre}</Text>
        {puede ? (
          <Button
            color="indigo"
            leftSection={<IconPlus size={16} />}
            onClick={() => setAlta(true)}
          >
            Nuevo producto
          </Button>
        ) : null}
      </Group>
      {suyos.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconPackage}
            titulo="Sin productos"
            descripcion="Puede ser uno nuevo o uno de Nail Show con la etiqueta del cliente."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Origen</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {suyos.map((p) => (
                <Table.Tr key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {p.nombre}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {p.codigo_interno}
                      {p.variedad ? ` · ${p.variedad}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {p.producto_base_id ? (
                      <Badge variant="light" color="violeta" radius="sm">
                        Nail Show con otra etiqueta: {nombre.get(p.producto_base_id)}
                      </Badge>
                    ) : (
                      <Badge variant="light" color="indigo" radius="sm">
                        Producto propio
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="xs"
                      variant="light"
                      color="indigo"
                      onClick={() => void navigate(`/lista-materiales?producto=${p.id}`)}
                    >
                      Qué lleva
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <Modal
        opened={alta}
        onClose={() => setAlta(false)}
        title={`Nuevo producto de ${tercero.nombre}`}
        size="lg"
        centered
        radius="md"
      >
        {alta ? (
          <FormularioProductoTercero
            tercero={tercero}
            onListo={(id) => {
              setAlta(false);
              if (id) void navigate(`/lista-materiales?producto=${id}`);
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

/* ------------------------------------------------------------------------- */

function PestanaProduccion({ tercero }: { tercero: Tercero }) {
  const pedidos = usePedidos();
  const navigate = useNavigate();
  const suyos = (pedidos.data ?? []).filter((p) => p.tercero_id === tercero.id);
  const enCurso = suyos.filter((p) => p.estado === 'EN_PRODUCCION');
  const hechos = suyos
    .filter((p) => p.estado === 'CUMPLIDO')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const fila = (p: (typeof suyos)[number]) => (
    <Table.Tr
      key={p.id}
      style={{ cursor: 'pointer' }}
      onClick={() => void navigate(`/pedidos/${p.id}`)}
    >
      <Table.Td>
        <Text size="sm" fw={600}>
          {p.numero}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{p.renglones[0]?.count ?? 0} productos</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{fecha(p.creado_en)}</Text>
      </Table.Td>
      <Table.Td>
        <BadgeEstadoPedido estado={p.estado} />
      </Table.Td>
    </Table.Tr>
  );

  return (
    <Stack gap="md">
      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group gap="xs" mb="xs">
          <IconSettings size={18} />
          <Text fw={600}>En producción ({enCurso.length})</Text>
        </Group>
        {enCurso.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nada en producción ahora.
          </Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Tbody>{enCurso.map(fila)}</Table.Tbody>
          </Table>
        )}
      </Paper>
      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group gap="xs" mb="xs">
          <IconCheck size={18} />
          <Text fw={600}>Terminados ({hechos.length})</Text>
        </Group>
        {hechos.length === 0 ? (
          <Text size="sm" c="dimmed">
            Todavía no se terminó ningún pedido de {tercero.nombre}.
          </Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Tbody>{hechos.map(fila)}</Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
