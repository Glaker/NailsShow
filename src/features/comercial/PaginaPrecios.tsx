import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { IconDiscount2, IconSearch, IconTag } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import { useClientes } from '@/lib/consultasFacturacion';
import {
  ROLES_PRECIOS,
  useCambiarPrecio,
  useCargarDescuento,
  useDescuentosVigentes,
  usePreciosVigentes,
  type PrecioVigente,
} from '@/lib/consultasPrecios';

const pesos = (v: number | string) => `$ ${numero(Number(v), 2)}`;

/**
 * Precios y descuentos (ítem 7 de la cola del 2026-09-24). El precio de lista
 * lleva IVA incluido; el pedido guarda el neto. Cada cambio es una versión
 * nueva: la anterior queda, y un pedido ya cargado conserva su precio (RN-59).
 */
export function PaginaPrecios() {
  const [vista, setVista] = useState<string | null>('precios');
  return (
    <>
      <EncabezadoPagina
        titulo="Precios y descuentos"
        descripcion="Precio de lista por producto (IVA incluido) y descuentos por cliente, generales o por producto."
      />
      <Tabs value={vista} onChange={setVista} color="violeta" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="precios" leftSection={<IconTag size={17} />}>
            Precios de lista
          </Tabs.Tab>
          <Tabs.Tab value="descuentos" leftSection={<IconDiscount2 size={17} />}>
            Descuentos por cliente
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="precios">
          <Precios />
        </Tabs.Panel>
        <Tabs.Panel value="descuentos">
          <Descuentos />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function Precios() {
  const precios = usePreciosVigentes();
  const productos = useProductos();
  const puede = useTieneRol(...ROLES_PRECIOS);
  const [texto, setTexto] = useDebouncedState('', 250);
  const [editando, setEditando] = useState<{
    id: string;
    nombre: string;
    actual: PrecioVigente | null;
  } | null>(null);
  const [soloSin, setSoloSin] = useState(false);

  const porId = useMemo(
    () => new Map((precios.data ?? []).map((p) => [p.producto_id, p])),
    [precios.data],
  );
  const busqueda = texto.trim().toLowerCase();
  const filas = (productos.data ?? [])
    .filter((p) => p.activo && p.tercero_id === null)
    .filter((p) => !soloSin || !porId.has(p.id))
    .filter(
      (p) =>
        !busqueda ||
        p.nombre.toLowerCase().includes(busqueda) ||
        p.codigo_interno.toLowerCase().includes(busqueda),
    );
  const sinPrecio = (productos.data ?? []).filter(
    (p) => p.activo && p.tercero_id === null && !porId.has(p.id),
  ).length;

  if (precios.isLoading || productos.isLoading) return <Skeleton h={300} />;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Producto o código"
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 340 }}
        />
        <Button
          variant={soloSin ? 'filled' : 'default'}
          onClick={() => setSoloSin(!soloSin)}
        >
          Sin precio ({sinPrecio})
        </Button>
      </Group>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Lista (con IVA)</Table.Th>
                <Table.Th ta="right">Neto</Table.Th>
                <Table.Th>Desde</Table.Th>
                {puede ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.slice(0, 300).map((p) => {
                const pr = porId.get(p.id) ?? null;
                return (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {p.nombre}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {p.codigo_interno}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {pr ? (
                        pesos(pr.precio_lista)
                      ) : (
                        <Badge color="gray" variant="light">
                          sin precio
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" c="dimmed">
                      {pr ? pesos(pr.precio_neto) : '—'}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{pr ? fecha(pr.vigente_desde) : '—'}</Text>
                      {pr?.motivo ? (
                        <Text size="xs" c="dimmed">
                          {pr.motivo}
                        </Text>
                      ) : null}
                    </Table.Td>
                    {puede ? (
                      <Table.Td>
                        <Button
                          size="compact-sm"
                          variant="light"
                          onClick={() =>
                            setEditando({ id: p.id, nombre: p.nombre, actual: pr })
                          }
                        >
                          {pr ? 'Cambiar' : 'Poner precio'}
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {filas.length > 300 ? (
          <Text size="xs" c="dimmed" p="sm">
            Se muestran 300 de {filas.length}: buscá para acotar.
          </Text>
        ) : null}
      </Paper>
      <ModalPrecio editando={editando} onCerrar={() => setEditando(null)} />
    </Stack>
  );
}

function ModalPrecio({
  editando,
  onCerrar,
}: {
  editando: { id: string; nombre: string; actual: PrecioVigente | null } | null;
  onCerrar: () => void;
}) {
  const cambiar = useCambiarPrecio();
  const [precio, setPrecio] = useState<number | string>('');
  const [motivo, setMotivo] = useState('');
  const n = typeof precio === 'number' ? precio : Number(precio || 0);
  return (
    <Modal
      opened={editando !== null}
      onClose={onCerrar}
      title={editando?.nombre ?? ''}
      centered
    >
      <Stack gap="md">
        {editando?.actual ? (
          <Text size="sm">
            Hoy: <b>{pesos(editando.actual.precio_lista)}</b> desde{' '}
            {fecha(editando.actual.vigente_desde)}. Los pedidos ya cargados conservan su
            precio.
          </Text>
        ) : null}
        <NumberInput
          label="Nuevo precio de lista (con IVA)"
          min={0}
          decimalScale={2}
          thousandSeparator="."
          decimalSeparator=","
          prefix="$ "
          value={precio}
          onChange={setPrecio}
        />
        <TextInput
          label="Motivo"
          placeholder="Aumento de septiembre, corrección…"
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={cambiar.isPending}
            disabled={!editando || n <= 0}
            onClick={() =>
              editando &&
              cambiar.mutate(
                {
                  productoId: editando.id,
                  precioLista: n,
                  motivo: motivo.trim() || null,
                },
                {
                  onSuccess: () => {
                    setPrecio('');
                    setMotivo('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Guardar precio
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Descuentos() {
  const descuentos = useDescuentosVigentes();
  const clientes = useClientes();
  const productos = useProductos();
  const cargar = useCargarDescuento();
  const puede = useTieneRol(...ROLES_PRECIOS);
  const [cliente, setCliente] = useState<string | null>(null);
  const [producto, setProducto] = useState<string | null>(null);
  const [porcentaje, setPorcentaje] = useState<number | string>('');
  const [motivo, setMotivo] = useState('');
  const filas = descuentos.data ?? [];
  const pct = typeof porcentaje === 'number' ? porcentaje : Number(porcentaje || 0);

  return (
    <Stack gap="md">
      {puede ? (
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Stack gap="sm">
            <Text fw={600}>Poner o cambiar un descuento</Text>
            <Group grow wrap="wrap" align="flex-end">
              <Select
                label="Cliente"
                searchable
                data={(clientes.data ?? [])
                  .filter((c) => c.activo)
                  .map((c) => ({ value: c.id, label: c.razon_social }))}
                value={cliente}
                onChange={setCliente}
              />
              <Select
                label="Producto"
                description="Vacío = descuento general del cliente"
                searchable
                clearable
                limit={60}
                data={(productos.data ?? [])
                  .filter((p) => p.activo && p.tercero_id === null)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.codigo_interno} · ${p.nombre}`,
                  }))}
                value={producto}
                onChange={setProducto}
              />
              <NumberInput
                label="Descuento %"
                description="0 lo quita"
                min={0}
                max={100}
                decimalScale={2}
                value={porcentaje}
                onChange={setPorcentaje}
              />
            </Group>
            <Group align="flex-end">
              <TextInput
                label="Motivo"
                placeholder="Mayorista, acuerdo comercial…"
                style={{ flex: 1 }}
                value={motivo}
                onChange={(e) => setMotivo(e.currentTarget.value)}
              />
              <Button
                loading={cargar.isPending}
                disabled={!cliente || porcentaje === '' || pct < 0 || pct > 100}
                onClick={() =>
                  cliente &&
                  cargar.mutate(
                    {
                      clienteId: cliente,
                      productoId: producto,
                      porcentaje: pct,
                      motivo: motivo.trim() || null,
                    },
                    {
                      onSuccess: () => {
                        setPorcentaje('');
                        setMotivo('');
                      },
                    },
                  )
                }
              >
                Guardar
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              El descuento de un producto gana sobre el general. El mayorista con factura
              de la planilla es un general del 35 %.
            </Text>
          </Stack>
        </Paper>
      ) : null}

      {descuentos.isLoading ? (
        <Skeleton h={160} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconDiscount2}
            titulo="Sin descuentos"
            descripcion="Todos los clientes pagan precio de lista."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Alcance</Table.Th>
                  <Table.Th ta="right">Descuento</Table.Th>
                  <Table.Th>Desde</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((d) => (
                  <Table.Tr key={`${d.cliente_id}-${d.producto_id ?? 'general'}`}>
                    <Table.Td fw={600}>{d.cliente}</Table.Td>
                    <Table.Td>
                      {d.producto ? (
                        <Text size="sm">{d.producto}</Text>
                      ) : (
                        <Badge variant="light">general</Badge>
                      )}
                      {d.motivo ? (
                        <Text size="xs" c="dimmed">
                          {d.motivo}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {numero(Number(d.porcentaje), 2)} %
                    </Table.Td>
                    <Table.Td>{fecha(d.vigente_desde)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}
