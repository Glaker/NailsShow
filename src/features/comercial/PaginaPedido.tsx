import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconChecks,
  IconHelpCircle,
  IconPackage,
  IconPlayerPlay,
  IconSend,
  IconShoppingCart,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useInsumos, useProductos } from '@/lib/consultas';
import { fechaHora, numero } from '@/lib/formato';
import {
  ROLES_ESCRIBEN_AVISOS,
  ROLES_ESCRIBEN_PEDIDOS,
  ROLES_TERMINAN_PEDIDOS,
  useConsumosPedido,
  useAgregarRenglonPedido,
  useAnotarCompras,
  useAvisosCompra,
  useCambiarCantidadRenglon,
  useCambiarEstadoPedido,
  useFaltantesPedido,
  useNomina,
  usePedido,
  useProductosConLista,
  useQuitarRenglon,
  useRenglonesPedido,
  type AvisoCompraRow,
  type EstadoPedido,
  type PedidoRenglonRow,
  type PedidoRow,
  type RenglonFaltante,
} from '@/lib/consultasComercial';
import { BadgeEntrega, BadgeEstadoAviso, BadgeEstadoPedido } from './estadoPedido';
import { TerminarPedido } from './TerminarPedido';
import { PasarAProduccion } from '@/features/tercerizados/PasarAProduccion';
import { colorTercero, useTerceros } from '@/lib/consultasTercerizados';
import {
  CeldasPrecio,
  ClienteDelPedido,
  SeccionFactura,
  TotalesPedido,
} from './FacturacionPedido';

/* ------------------------------------------------------------------------- *
 * Circuito del pedido
 *
 * La pantalla ofrece solo el paso siguiente del estado actual, más volver a
 * borrador desde «enviado» para corregir antes de que Producción lo tome.
 * La base hoy acepta cualquier cambio entre los cinco valores: esto evita el
 * salto accidental, no lo impide. Queda anotado como pendiente de base.
 * ------------------------------------------------------------------------- */

interface Paso {
  destino: EstadoPedido;
  etiqueta: string;
  icono: typeof IconSend;
  tipo: 'principal' | 'secundario' | 'peligro';
  confirmar?: { titulo: string; texto: string };
}

const TEXTO_CANCELAR =
  'El pedido queda cancelado y visible en «Cerrados». Las compras que se hayan anotado para él siguen en la lista de compras pendientes hasta que alguien las descarte.';

const PASOS: Record<EstadoPedido, Paso[]> = {
  BORRADOR: [
    {
      destino: 'CONFIRMADO',
      etiqueta: 'Enviar a producción',
      icono: IconSend,
      tipo: 'principal',
    },
    {
      destino: 'CANCELADO',
      etiqueta: 'Cancelar',
      icono: IconX,
      tipo: 'peligro',
      confirmar: { titulo: 'Cancelar el pedido', texto: TEXTO_CANCELAR },
    },
  ],
  CONFIRMADO: [
    {
      destino: 'EN_PRODUCCION',
      etiqueta: 'Pasar a producción',
      icono: IconPlayerPlay,
      tipo: 'principal',
    },
    {
      destino: 'BORRADOR',
      etiqueta: 'Devolver a borrador',
      icono: IconArrowBackUp,
      tipo: 'secundario',
      confirmar: {
        titulo: 'Devolver a borrador',
        texto:
          'El pedido sale de la bandeja de Producción para que quien lo cargó pueda corregir los productos. Después hay que volver a enviarlo.',
      },
    },
    {
      destino: 'CANCELADO',
      etiqueta: 'Cancelar',
      icono: IconX,
      tipo: 'peligro',
      confirmar: { titulo: 'Cancelar el pedido', texto: TEXTO_CANCELAR },
    },
  ],
  // Terminar no es un cambio de estado: es «Terminado», que registra lo
  // consumido y baja el stock (TerminarPedido). La base no deja llegar a
  // CUMPLIDO de otra forma.
  EN_PRODUCCION: [
    {
      destino: 'CANCELADO',
      etiqueta: 'Cancelar',
      icono: IconX,
      tipo: 'peligro',
      confirmar: { titulo: 'Cancelar el pedido', texto: TEXTO_CANCELAR },
    },
  ],
  CUMPLIDO: [],
  CANCELADO: [],
};

const GUIA: Record<EstadoPedido, string> = {
  BORRADOR:
    'Borrador: Producción todavía no lo tiene como pendiente. Revisá los productos y envialo cuando esté completo.',
  CONFIRMADO:
    'Enviado a producción: está en la bandeja de Gerencia de Producción para revisar si alcanza el material y anotar lo que haya que comprar.',
  EN_PRODUCCION:
    'En producción: Producción ya lo tomó. Cuando esté hecho, «Terminado» descuenta lo que se usó.',
  CUMPLIDO: 'Terminado: lo consumido ya se descontó del stock.',
  CANCELADO: 'Cancelado.',
};

/**
 * Ficha del pedido, con la respuesta a «¿se puede fabricar?» y lo que falta
 * comprar.
 *
 * `comercial.explotar_pedido()` devuelve solo los faltantes. Una lista vacía es
 * la buena noticia, y por eso la pantalla la traduce a un cartel explícito en
 * vez de mostrar una tabla sin filas: nadie lee «0 resultados» como «sí». Pero
 * la lista vacía solo es buena noticia si todos los productos tienen lista de
 * materiales: un producto sin lista no genera faltantes, y eso es «no sé», no
 * «hay».
 */
export function PaginaPedido() {
  const { id } = useParams<{ id: string }>();
  const pedido = usePedido(id);
  const renglones = useRenglonesPedido(id);
  const faltantes = useFaltantesPedido(id);
  const productos = useProductos();
  const avisos = useAvisosCompra();
  const nomina = useNomina();
  const cambiarEstado = useCambiarEstadoPedido();
  const puedeEditar = useTieneRol(...ROLES_ESCRIBEN_PEDIDOS);
  const puedeTerminar = useTieneRol(...ROLES_TERMINAN_PEDIDOS);
  const [terminando, setTerminando] = useState(false);
  const [pasando, setPasando] = useState(false);
  const terceros = useTerceros();

  const lista = renglones.data ?? [];
  const conLista = useProductosConLista(lista.map((r) => r.producto_id));

  const productoPorId = useMemo(
    () => new Map((productos.data ?? []).map((p) => [p.id, p])),
    [productos.data],
  );

  if (pedido.isLoading) return <Skeleton h={320} />;
  if (!pedido.data) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio icono={IconPackage} titulo="No se encontró el pedido" />
      </Paper>
    );
  }

  const p = pedido.data;
  const cerrado = p.estado === 'CUMPLIDO' || p.estado === 'CANCELADO';
  const editable = puedeEditar && p.estado === 'BORRADOR';
  const sinRenglones = lista.length === 0;
  const sinLista = conLista.data
    ? lista.filter((r) => !conLista.data.has(r.producto_id))
    : [];

  const tercero = (terceros.data ?? []).find((t) => t.id === p.tercero_id) ?? null;

  function avanzar(paso: Paso) {
    // Tercerizado: antes de producir se elige de qué stock sale cada insumo.
    if (paso.destino === 'EN_PRODUCCION' && tercero) {
      setPasando(true);
      return;
    }
    const ejecutar = () => cambiarEstado.mutate({ id: p.id, estado: paso.destino });
    if (!paso.confirmar) {
      ejecutar();
      return;
    }
    modals.openConfirmModal({
      title: paso.confirmar.titulo,
      children: <Text size="sm">{paso.confirmar.texto}</Text>,
      labels: { confirm: paso.etiqueta, cancel: 'Volver' },
      confirmProps: { color: paso.tipo === 'peligro' ? 'red' : 'violeta' },
      onConfirm: ejecutar,
    });
  }

  return (
    <>
      <EncabezadoPagina
        titulo={`Pedido ${p.numero}`}
        descripcion={p.cliente}
        acciones={
          <Group gap="sm">
            {tercero ? (
              <Badge
                component={Link}
                to={`/tercerizados/${tercero.id}`}
                size="lg"
                radius="sm"
                variant="filled"
                color={colorTercero(tercero)}
                style={{ cursor: 'pointer' }}
              >
                Tercerizado · {tercero.nombre}
              </Badge>
            ) : null}
            <BadgeEstadoPedido estado={p.estado} />
            {puedeTerminar &&
            (p.estado === 'CONFIRMADO' || p.estado === 'EN_PRODUCCION') ? (
              <Button
                size="md"
                color="estadoAprobado"
                leftSection={<IconChecks size={18} />}
                onClick={() => setTerminando(true)}
              >
                Terminado
              </Button>
            ) : null}
            {puedeEditar
              ? PASOS[p.estado].map((paso) => {
                  const Icono = paso.icono;
                  const bloqueado = paso.destino === 'CONFIRMADO' && sinRenglones;
                  return (
                    <Tooltip
                      key={paso.destino}
                      label="Agregá al menos un producto antes de enviarlo."
                      disabled={!bloqueado}
                    >
                      <Button
                        size="md"
                        leftSection={<Icono size={18} />}
                        variant={
                          paso.tipo === 'principal'
                            ? 'filled'
                            : paso.tipo === 'peligro'
                              ? 'subtle'
                              : 'default'
                        }
                        color={paso.tipo === 'peligro' ? 'red' : 'violeta'}
                        disabled={bloqueado}
                        loading={
                          cambiarEstado.isPending &&
                          cambiarEstado.variables?.estado === paso.destino
                        }
                        onClick={() => avanzar(paso)}
                      >
                        {paso.etiqueta}
                      </Button>
                    </Tooltip>
                  );
                })
              : null}
          </Group>
        }
      />

      <Stack gap="lg">
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <Dato etiqueta="Entrega comprometida">
              <BadgeEntrega fechaEntrega={p.fecha_entrega} abierto={!cerrado} />
            </Dato>
            <Dato etiqueta="Cargado">
              <Text size="sm">
                {fechaHora(p.creado_en)}
                {nomina.data?.get(p.creado_por)
                  ? ` · ${nomina.data.get(p.creado_por)}`
                  : ''}
              </Text>
            </Dato>
            <Dato etiqueta="Cliente para facturar">
              <ClienteDelPedido pedido={p} />
            </Dato>
            <Dato etiqueta="Observaciones">
              <Text size="sm" c={p.observaciones ? 'inherit' : 'dimmed'}>
                {p.observaciones ?? 'Sin observaciones'}
              </Text>
            </Dato>
          </SimpleGrid>
          <Text size="sm" c="dimmed" mt="md">
            {GUIA[p.estado]}
          </Text>
        </Paper>

        {/* ---------------- Qué se pidió ---------------- */}
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>Productos del pedido</Text>
              {!editable && puedeEditar && p.estado === 'CONFIRMADO' ? (
                <Text size="xs" c="dimmed">
                  Para corregir productos, devolvelo a borrador.
                </Text>
              ) : null}
            </Group>

            {renglones.isLoading ? (
              <Skeleton h={80} />
            ) : sinRenglones ? (
              <Text size="sm" c="dimmed">
                Todavía no hay productos en este pedido.
                {editable ? ' Agregá el primero para ver qué hace falta.' : ''}
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={820}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Producto</Table.Th>
                      <Table.Th ta="right">Cantidad</Table.Th>
                      <Table.Th ta="right">Precio neto</Table.Th>
                      <Table.Th ta="right">IVA</Table.Th>
                      <Table.Th ta="right">Subtotal</Table.Th>
                      {editable ? <Table.Th w={60} /> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {lista.map((r) => (
                      <FilaRenglon
                        key={r.id}
                        renglon={r}
                        producto={productoPorId.get(r.producto_id)}
                        sinLista={sinLista.some((s) => s.id === r.id)}
                        editable={editable}
                      />
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}

            {sinRenglones ? null : <TotalesPedido renglones={lista} />}

            {editable ? (
              <AgregarRenglon
                pedidoId={p.id}
                yaCargados={new Set(lista.map((r) => r.producto_id))}
              />
            ) : null}
          </Stack>
        </Paper>

        <SeccionFactura pedido={p} renglones={lista} />

        {/* ---------------- ¿Se puede fabricar? ---------------- */}
        {p.estado === 'CUMPLIDO' ? (
          <ConsumoRegistrado pedidoId={p.id} />
        ) : p.estado === 'CANCELADO' || sinRenglones ? null : faltantes.isLoading ||
          conLista.isLoading ? (
          <Skeleton h={160} />
        ) : (
          <Stack gap="md">
            {sinLista.length > 0 ? (
              <Alert
                color="estadoEnAnalisis"
                variant="light"
                radius="md"
                icon={<IconHelpCircle size={18} />}
                title={
                  sinLista.length === 1
                    ? 'Un producto no tiene cargado qué lleva'
                    : `${sinLista.length} productos no tienen cargado qué lleva`
                }
              >
                Para esos productos el sistema no puede saber si falta envase, tapa o
                etiqueta, así que no aparecen abajo aunque falten. Se cargan en{' '}
                <Anchor component={Link} to="/lista-materiales" size="sm">
                  Qué lleva cada producto
                </Anchor>
                .
              </Alert>
            ) : null}

            {(faltantes.data ?? []).length === 0 ? (
              sinLista.length === lista.length ? null : (
                <Alert
                  color="estadoAprobado"
                  variant="light"
                  radius="md"
                  icon={<IconCheck size={18} />}
                  title={
                    sinLista.length === 0
                      ? 'Alcanza el material que hay'
                      : 'Alcanza el material de los productos que tienen lista'
                  }
                >
                  Todo lo que la lista de materiales de estos productos pide está en stock
                  y sin reservar por otro pedido. El disponible cuenta los lotes aprobados
                  y el saldo de apertura, sin los vencidos ni los bloqueados.
                </Alert>
              )
            ) : (
              <FaltantesDePedido
                pedido={p}
                filas={faltantes.data ?? []}
                avisos={avisos.data ?? []}
                cerrado={cerrado}
              />
            )}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={pasando}
        onClose={() => setPasando(false)}
        title={`Pasar a producción el pedido ${p.numero}`}
        size="xl"
        centered
        radius="md"
      >
        {pasando && tercero ? (
          <PasarAProduccion
            pedido={p}
            tercero={tercero}
            onListo={() => setPasando(false)}
          />
        ) : null}
      </Modal>

      <Modal
        opened={terminando}
        onClose={() => setTerminando(false)}
        title={`Terminar el pedido ${p.numero}`}
        size="xl"
        centered
        radius="md"
      >
        {terminando ? (
          <TerminarPedido pedido={p} onListo={() => setTerminando(false)} />
        ) : null}
      </Modal>
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      {children}
    </Stack>
  );
}

/* ------------------------------------------------------------------------- *
 * Renglones
 * ------------------------------------------------------------------------- */

function FilaRenglon({
  renglon,
  producto,
  sinLista,
  editable,
}: {
  renglon: PedidoRenglonRow;
  producto: { nombre: string; codigo_interno: string } | undefined;
  sinLista: boolean;
  editable: boolean;
}) {
  const cambiar = useCambiarCantidadRenglon();
  const quitar = useQuitarRenglon();
  const [cantidad, setCantidad] = useState<number | string>(Number(renglon.cantidad));

  function guardarCantidad() {
    const n = typeof cantidad === 'number' ? cantidad : Number(cantidad);
    if (!Number.isFinite(n) || n <= 0) {
      setCantidad(Number(renglon.cantidad));
      return;
    }
    if (n === Number(renglon.cantidad)) return;
    cambiar.mutate({ id: renglon.id, pedidoId: renglon.pedido_id, cantidad: n });
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text size="sm">{producto?.nombre ?? '(producto)'}</Text>
            {producto ? (
              <Text size="xs" c="dimmed">
                {producto.codigo_interno}
              </Text>
            ) : null}
          </div>
          {sinLista ? (
            <Tooltip label="No tiene cargado qué lleva: sus faltantes no se pueden calcular.">
              <Badge color="estadoEnAnalisis" variant="light" radius="sm">
                Sin lista
              </Badge>
            </Tooltip>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td ta="right">
        {editable ? (
          <NumberInput
            aria-label="Cantidad"
            min={1}
            allowDecimal={false}
            hideControls
            w={110}
            ml="auto"
            value={cantidad}
            onChange={setCantidad}
            onBlur={guardarCantidad}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        ) : (
          <Text size="sm" ff="monospace" fw={600}>
            {numero(renglon.cantidad, 0)}
          </Text>
        )}
      </Table.Td>
      <CeldasPrecio renglon={renglon} editable={editable} />
      {editable ? (
        <Table.Td>
          <ActionIcon
            variant="subtle"
            color="red"
            size="xl"
            aria-label="Quitar producto"
            loading={quitar.isPending}
            onClick={() => quitar.mutate({ id: renglon.id, pedidoId: renglon.pedido_id })}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Table.Td>
      ) : null}
    </Table.Tr>
  );
}

function AgregarRenglon({
  pedidoId,
  yaCargados,
}: {
  pedidoId: string;
  yaCargados: Set<string>;
}) {
  const productos = useProductos();
  const agregar = useAgregarRenglonPedido();
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | ''>('');

  const opciones = (productos.data ?? [])
    .filter((x) => x.activo && !yaCargados.has(x.id))
    .map((x) => ({ value: x.id, label: `${x.codigo_interno} · ${x.nombre}` }));

  return (
    <Group align="flex-end" wrap="wrap" gap="sm">
      <Select
        label="Agregar producto"
        placeholder="Buscá por código o nombre"
        searchable
        limit={50}
        nothingFoundMessage="Sin coincidencias"
        style={{ flex: 1, minWidth: 240 }}
        data={opciones}
        value={productoId}
        onChange={setProductoId}
      />
      <NumberInput
        label="Cantidad"
        min={1}
        allowDecimal={false}
        hideControls
        w={120}
        value={cantidad}
        onChange={(v) => setCantidad(typeof v === 'number' ? v : '')}
      />
      <Button
        size="md"
        disabled={!productoId || typeof cantidad !== 'number' || cantidad <= 0}
        loading={agregar.isPending}
        onClick={() => {
          if (!productoId || typeof cantidad !== 'number') return;
          agregar.mutate(
            { pedidoId, productoId, cantidad },
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
  );
}

/* ------------------------------------------------------------------------- *
 * Faltantes y compras
 * ------------------------------------------------------------------------- */

function FaltantesDePedido({
  pedido,
  filas,
  avisos,
  cerrado,
}: {
  pedido: PedidoRow;
  filas: RenglonFaltante[];
  avisos: AvisoCompraRow[];
  cerrado: boolean;
}) {
  const anotar = useAnotarCompras();
  const puedeAnotar = useTieneRol(...ROLES_ESCRIBEN_AVISOS) && !cerrado;

  const abiertos = avisos.filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'EN_COMPRA',
  );
  const deEste = new Map(
    abiertos.filter((a) => a.pedido_id === pedido.id).map((a) => [a.insumo_id, a]),
  );
  const deOtros = (insumoId: string) =>
    abiertos.filter((a) => a.insumo_id === insumoId && a.pedido_id !== pedido.id);

  const sinProveedor = filas.filter((f) => !f.proveedor_id).length;
  const porAnotar = filas.filter((f) => !deEste.has(f.insumo_id) && f.unidad);

  function anotarFilas(lista: RenglonFaltante[]) {
    anotar.mutate(
      lista.map((f) => ({
        pedidoId: pedido.id,
        insumoId: f.insumo_id,
        cantidad: Number(f.faltante),
        unidad: f.unidad!,
        proveedorId: f.proveedor_id,
        // Sin plazos de entrega de proveedor cargados, el único límite honesto
        // es la entrega comprometida del pedido.
        fechaLimite: pedido.fecha_entrega,
      })),
    );
  }

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: sinProveedor > 0 ? 3 : 2 }} spacing="md">
        <TarjetaIndicador
          etiqueta="Insumos que faltan"
          valor={String(filas.length)}
          icono={IconShoppingCart}
          detalle="Solo se listan los que no alcanzan."
        />
        <TarjetaIndicador
          etiqueta="Anotados para comprar"
          valor={`${filas.length - porAnotar.length} de ${filas.length}`}
          icono={IconChecks}
          detalle="Quedan en Compras pendientes."
        />
        {sinProveedor > 0 ? (
          <TarjetaIndicador
            etiqueta="Sin proveedor sugerido"
            valor={String(sinProveedor)}
            icono={IconAlertTriangle}
            detalle="No hay compra previa registrada de ese insumo."
          />
        ) : null}
      </SimpleGrid>

      <Alert
        color="estadoEnAnalisis"
        variant="light"
        radius="md"
        icon={<IconAlertTriangle size={18} />}
        title="Falta material para cubrir este pedido"
      >
        <Stack gap="sm">
          <Text size="sm">
            El disponible ya descuenta lo que está en cuarentena, lo bloqueado y lo
            reservado por otros pedidos. Lo que anotes para comprar queda en{' '}
            <Anchor component={Link} to="/compras" size="sm">
              Compras pendientes
            </Anchor>
            .
          </Text>
          {puedeAnotar && porAnotar.length > 0 ? (
            <Button
              size="md"
              leftSection={<IconShoppingCart size={18} />}
              loading={anotar.isPending}
              onClick={() => anotarFilas(porAnotar)}
              style={{ alignSelf: 'flex-start' }}
            >
              Anotar todo lo que falta ({porAnotar.length})
            </Button>
          ) : null}
        </Stack>
      </Alert>

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th ta="right">Necesario</Table.Th>
                <Table.Th ta="right">Disponible</Table.Th>
                <Table.Th ta="right">Falta</Table.Th>
                <Table.Th>Proveedor sugerido</Table.Th>
                <Table.Th>Compra</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => {
                const propio = deEste.get(f.insumo_id);
                const otros = deOtros(f.insumo_id);
                return (
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
                    <Table.Td>
                      <Stack gap={4} align="flex-start">
                        {propio ? (
                          <BadgeEstadoAviso estado={propio.estado} />
                        ) : !f.unidad ? (
                          <Tooltip label="El insumo no tiene unidad de medida cargada en el catálogo.">
                            <Text size="xs" c="dimmed">
                              Sin unidad
                            </Text>
                          </Tooltip>
                        ) : puedeAnotar ? (
                          <Button
                            size="sm"
                            variant="light"
                            loading={anotar.isPending}
                            onClick={() => anotarFilas([f])}
                          >
                            Anotar
                          </Button>
                        ) : (
                          <Text size="xs" c="dimmed">
                            Sin anotar
                          </Text>
                        )}
                        {otros.length > 0 ? (
                          <Tooltip
                            multiline
                            w={260}
                            label="Otro pedido ya pidió comprar este insumo. Los dos pedidos se calculan contra el mismo stock: sumá las cantidades antes de pedirle al proveedor."
                          >
                            <Text size="xs" c="estadoEnAnalisis.8">
                              También para{' '}
                              {otros
                                .map(
                                  (o) =>
                                    `${o.pedido?.numero ?? 'otro'} (${numero(o.cantidad, 2)} ${o.unidad})`,
                                )
                                .join(', ')}
                            </Text>
                          </Tooltip>
                        ) : null}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}

/* ------------------------------------------------------------------------- *
 * Lo que se consumió
 * ------------------------------------------------------------------------- */

/**
 * Consumo registrado al terminar: la receta al lado de lo que se usó, con el
 * motivo de cada diferencia. Es lo que se mira cuando alguien pregunta por qué
 * el stock de un insumo bajó más de lo esperado.
 */
function ConsumoRegistrado({ pedidoId }: { pedidoId: string }) {
  const consumos = useConsumosPedido(pedidoId);
  const insumos = useInsumos();
  const nomina = useNomina();
  const insumoPorId = new Map((insumos.data ?? []).map((i) => [i.id, i]));
  const filas = consumos.data ?? [];

  if (consumos.isLoading) return <Skeleton h={120} />;

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Lo que se consumió</Text>
          {filas[0] ? (
            <Text size="xs" c="dimmed">
              {fechaHora(filas[0].registrado_en)}
              {nomina.data?.get(filas[0].registrado_por)
                ? ` · ${nomina.data.get(filas[0].registrado_por)}`
                : ''}
            </Text>
          ) : null}
        </Group>
        {filas.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay consumo registrado.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th ta="right">Receta</Table.Th>
                  <Table.Th ta="right">Se usó</Table.Th>
                  <Table.Th>Motivo de la diferencia</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((c) => {
                  const ins = insumoPorId.get(c.insumo_id);
                  const u = c.unidad === 'UNIDAD' ? 'u' : c.unidad;
                  const dec = u === 'u' ? 0 : 2;
                  const distinto = Number(c.cantidad_real) !== Number(c.cantidad_teorica);
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Text size="sm">{ins?.nombre ?? '(insumo)'}</Text>
                        <Text size="xs" c="dimmed">
                          {ins?.codigo_interno}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" c="dimmed">
                          {numero(c.cantidad_teorica, dec)} {u}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" fw={distinto ? 700 : 400}>
                          {numero(c.cantidad_real, dec)} {u}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={c.motivo_diferencia ? 'inherit' : 'dimmed'}>
                          {c.motivo_diferencia ?? '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Paper>
  );
}
