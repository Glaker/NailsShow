import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Popover,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconCircleCheck,
  IconFileInvoice,
  IconPencil,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useClientes } from '@/lib/consultasFacturacion';
import { useEliminarPedido, useNomina } from '@/lib/consultasComercial';
import { useDepositos } from '@/lib/consultas';
import { useTieneRol } from '@/features/auth/sesion';
import { BadgeEstadoPedido } from '@/features/comercial/estadoPedido';
import { TablaEscala } from './TablaEscala';
import { fecha, fechaHora, fechaISO, numero, desdeCalendario } from '@/lib/formato';
import {
  DEPOSITOS_VENTA,
  ESTADOS_SIN_APROBAR,
  FORMAS_PAGO,
  TEXTO_PAGO,
  calcularVenta,
  precioFinalRenglon,
  precioFinalUnidad,
  useDescuentosCaja,
  proximoEscalon,
  saleDeFabrica,
  useDisponiblePt,
  useEnviarVenta,
  useReservadoPedido,
  useEscalaDescuento,
  useGuardarVenta,
  useListaMayorista,
  usePedirFecha,
  usePropuestaFecha,
  useVenta,
  type FilaLista,
} from '@/lib/consultasVentas';

const pesos = (n: number) => `$${numero(n, 0)}`;
const pct = (n: number) => `${numero(n * 100, 0)} %`;

/** Precio final escrito a mano, por unidad del código (un pack si es pack). */
function PrecioManual({
  valor,
  sugerido,
  onCambiar,
  deshabilitado,
}: {
  valor: number | null;
  sugerido: number;
  onCambiar: (v: number | null) => void;
  deshabilitado: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<number | string>(valor ?? sugerido);
  return (
    <Popover opened={abierto} onChange={setAbierto} withArrow shadow="md" position="left">
      <Popover.Target>
        <Tooltip label="Poner otro precio a mano">
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={deshabilitado}
            onClick={() => {
              setBorrador(valor ?? sugerido);
              setAbierto((o) => !o);
            }}
            aria-label="Precio a mano"
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <NumberInput
            label="Precio final con IVA"
            prefix="$"
            thousandSeparator="."
            decimalSeparator=","
            min={0}
            value={borrador}
            onChange={setBorrador}
            data-autofocus
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => {
                onCambiar(null);
                setAbierto(false);
              }}
            >
              Volver a la lista
            </Button>
            <Button
              size="compact-sm"
              onClick={() => {
                onCambiar(Number(borrador) || 0);
                setAbierto(false);
              }}
            >
              Usar
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Descuento por caja cerrada de un renglón (D-descuento-caja-1): se marca y
 * arranca con el % de la lista de cajas; Ventas lo puede cambiar. Va encima
 * del descuento del pedido. Mixto (D-caja-mixta-1): Ventas dice cuántas cajas
 * cerradas van; el resto de la cantidad sale suelto, sin descuento de caja.
 */
type CajaRenglon = { pct: number; uds: number | null };

function MarcadorCaja({
  def,
  valor,
  cantidad,
  deshabilitado,
  onCambiar,
}: {
  def: { unidades_caja: number; porcentaje: number };
  valor: CajaRenglon | null;
  cantidad: number;
  deshabilitado: boolean;
  onCambiar: (x: CajaRenglon | null) => void;
}) {
  // uds null = todo el renglón en caja (renglones de antes de D-caja-mixta-1).
  const enCaja = valor ? Math.min(valor.uds ?? cantidad, cantidad) : 0;
  const sueltas = cantidad - enCaja;
  return (
    <Group gap={6} wrap="nowrap">
      <Checkbox
        size="sm"
        checked={valor !== null}
        disabled={deshabilitado}
        onChange={(e) =>
          onCambiar(
            e.currentTarget.checked
              ? {
                  pct: def.porcentaje,
                  uds: Math.floor(cantidad / def.unidades_caja) * def.unidades_caja,
                }
              : null,
          )
        }
        aria-label={`Descuento por caja de ${def.unidades_caja}`}
        label={<Text size="xs">caja ×{def.unidades_caja}</Text>}
      />
      {valor !== null ? (
        <>
          <NumberInput
            size="xs"
            w={64}
            min={0}
            allowDecimal={false}
            suffix=" cj"
            value={(valor.uds ?? cantidad) / def.unidades_caja}
            disabled={deshabilitado}
            onChange={(x) =>
              onCambiar({ ...valor, uds: (Number(x) || 0) * def.unidades_caja })
            }
            aria-label="Cajas cerradas"
          />
          <NumberInput
            size="xs"
            w={70}
            min={0}
            max={100}
            decimalScale={2}
            suffix=" %"
            hideControls
            value={valor.pct}
            disabled={deshabilitado}
            onChange={(x) => onCambiar({ ...valor, pct: typeof x === 'number' ? x : 0 })}
            aria-label="Porcentaje de descuento por caja"
          />
          {sueltas > 0 ? (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              + {numero(sueltas)} sueltas
            </Text>
          ) : null}
          {(valor.uds ?? 0) > cantidad ? (
            <Text size="xs" c="red" style={{ whiteSpace: 'nowrap' }}>
              más que la cantidad
            </Text>
          ) : null}
        </>
      ) : null}
    </Group>
  );
}

/** Una caja que se arma con aromas del mismo producto (D-armar-caja-1). */
type Surtido = {
  clave: string;
  nombre: string;
  unidades_caja: number;
  porcentaje: number;
  productos: { producto_id: string; producto: string; codigo: string }[];
};

/**
 * Armar caja (D-armar-caja-1): Ventas elige un producto que viene en aromas,
 * reparte las unidades de la caja entre los aromas y la agrega al pedido. Cada
 * aroma suma esas unidades a su cantidad y a lo que va en caja, con el % de la
 * caja.
 */
function ArmarCaja({
  surtidos,
  caja,
  cantidad,
  deshabilitado,
  onAgregar,
  onQuitar,
}: {
  surtidos: Surtido[];
  caja: Map<string, CajaRenglon>;
  cantidad: (pid: string) => number;
  deshabilitado: boolean;
  onAgregar: (s: Surtido, reparto: Map<string, number>) => void;
  onQuitar: (s: Surtido) => void;
}) {
  const [clave, setClave] = useState<string | null>(null);
  const [reparto, setReparto] = useState(new Map<string, number>());
  const elegido = surtidos.find((s) => s.clave === clave);
  const puestas = [...reparto.values()].reduce((a, x) => a + x, 0);
  const enCaja = (s: Surtido) =>
    s.productos.reduce((a, p) => {
      const r = caja.get(p.producto_id);
      const c = cantidad(p.producto_id);
      return a + (r ? Math.min(r.uds ?? c, c) : 0);
    }, 0);
  const armadas = surtidos.filter((s) => enCaja(s) > 0);
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      mb={110}
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Title order={4} mb={4}>
        Armar caja
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Mismo producto y presentación; solo cambia el aroma. Repartí las unidades de la
        caja entre los aromas y agregala: lleva el descuento de caja.
      </Text>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          label="Producto"
          placeholder="Elegí qué caja armar"
          data={surtidos.map((s) => ({
            value: s.clave,
            label: `${s.nombre} · caja de ${s.unidades_caja} · ${numero(s.porcentaje)} %`,
          }))}
          value={clave}
          onChange={(x) => {
            setClave(x);
            setReparto(new Map());
          }}
          disabled={deshabilitado}
          w={420}
          maw="100%"
        />
      </Group>
      {elegido ? (
        <>
          <Group gap="sm" mt="sm" wrap="wrap" align="flex-end">
            {elegido.productos.map((p) => (
              <NumberInput
                key={p.producto_id}
                label={`${p.codigo} · ${p.producto}`}
                min={0}
                max={elegido.unidades_caja}
                allowDecimal={false}
                w={220}
                value={reparto.get(p.producto_id) ?? ''}
                placeholder="0"
                disabled={deshabilitado}
                onChange={(x) =>
                  setReparto((m) => new Map(m).set(p.producto_id, Number(x) || 0))
                }
              />
            ))}
          </Group>
          <Group mt="sm" gap="md">
            <Text
              size="sm"
              fw={700}
              c={puestas === elegido.unidades_caja ? 'estadoAprobado' : 'orange'}
            >
              {numero(puestas)} de {numero(elegido.unidades_caja)} unidades
            </Text>
            <Button
              disabled={deshabilitado || puestas !== elegido.unidades_caja}
              onClick={() => {
                onAgregar(elegido, reparto);
                setReparto(new Map());
              }}
            >
              Agregar caja al pedido
            </Button>
          </Group>
        </>
      ) : null}
      {armadas.length ? (
        <Stack gap={4} mt="md">
          {armadas.map((s) => {
            const u = enCaja(s);
            const completas = Math.floor(u / s.unidades_caja);
            return (
              <Group key={s.clave} gap="sm">
                <Text size="sm">
                  <b>{s.nombre}</b>: {numero(completas)}{' '}
                  {completas === 1 ? 'caja' : 'cajas'} ({numero(u)} u)
                </Text>
                {u % s.unidades_caja ? (
                  <Badge color="red" variant="light">
                    {numero(u % s.unidades_caja)} u no completan una caja
                  </Badge>
                ) : null}
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  disabled={deshabilitado}
                  onClick={() => onQuitar(s)}
                >
                  Quitar cajas (quedan sueltas)
                </Button>
              </Group>
            );
          })}
        </Stack>
      ) : null}
    </Paper>
  );
}

/**
 * Un pedido mayorista (pedido del 2026-10-01): la lista de precios 46.14 con
 * una columna de cantidad, como la planilla. El total de abajo se va sumando,
 * y al pasar cada escalón el descuento se aplica al pedido entero. Cada
 * renglón muestra cuánto hay disponible en Calle 5.
 */
export function PaginaVenta() {
  const { id } = useParams();
  const nuevo = !id || id === 'nuevo';
  const lista = useListaMayorista();
  const venta = useVenta(nuevo ? undefined : id);
  if (lista.isLoading || (!nuevo && venta.isLoading))
    return <Skeleton h={480} radius="lg" />;
  if (!nuevo && !venta.data)
    return (
      <Alert color="red" title="No se encontró el pedido">
        <Anchor component={Link} to="/ventas">
          Volver a Ventas
        </Anchor>
      </Alert>
    );
  // La planilla arranca con lo guardado y se vuelve a montar al cambiar de pedido.
  return (
    <Planilla key={nuevo ? 'nuevo' : id} id={nuevo ? null : id} datos={venta.data} />
  );
}

type DatosVenta = NonNullable<ReturnType<typeof useVenta>['data']>;

function Planilla({ id, datos }: { id: string | null; datos: DatosVenta | undefined }) {
  const nuevo = id === null;
  const navigate = useNavigate();
  const lista = useListaMayorista();
  const escala = useEscalaDescuento();
  const cajas = useDescuentosCaja();
  const clientes = useClientes();
  const venta = useVenta(id ?? undefined);
  const depositos = useDepositos();
  const descartar = useEliminarPedido();
  const [descartando, setDescartando] = useState(false);
  const [motivoDescarte, setMotivoDescarte] = useState('');
  const guardar = useGuardarVenta();
  const enviar = useEnviarVenta();
  const pedirFecha = usePedirFecha();
  // Aprobar es de Ventas (comercial.enviar_venta, 20261019120100).
  const puedeAprobar = useTieneRol('VENTAS', 'ADMINISTRACION');
  const propuesta = usePropuestaFecha(id ?? undefined);
  const nomina = useNomina();

  const g = datos?.venta;
  const [cliente, setCliente] = useState(g?.cliente ?? '');
  /* De qué depósito sale (D-venta-deposito-1): por defecto Fábrica para los
     clientes de la lista y Berna para el resto; Ventas lo cambia. */
  const [origen, setOrigen] = useState<string | null>(datos?.depositoOrigenId ?? null);
  const idDeposito = (numero: string) =>
    (depositos.data ?? []).find((d) => d.numero === numero)?.id ?? null;
  const origenId =
    origen ??
    (datos && !datos.depositoOrigenId && id !== null
      ? idDeposito('C5') // pedidos de antes: salían de Calle 5
      : idDeposito(saleDeFabrica(cliente) ? 'PTF' : 'BER'));
  const nombreOrigen =
    DEPOSITOS_VENTA.find((d) => idDeposito(d.numero) === origenId)?.etiqueta ??
    'el depósito';
  const libres = useDisponiblePt(origenId);
  const reservado = useReservadoPedido(id);
  /** Lo que puede salir del depósito para este pedido: lo libre más lo que ya tiene reservado. */
  const dispDe = (pid: string) =>
    (libres.data?.get(pid) ?? 0) + (reservado.data?.get(pid) ?? 0);
  const [entrega, setEntrega] = useState<Date | null>(
    g?.fecha_entrega ? new Date(`${g.fecha_entrega}T12:00:00`) : null,
  );
  const [formaPago, setFormaPago] = useState(g?.forma_pago ?? '');
  const [destino, setDestino] = useState(g?.destino_envio ?? '');
  const [obs, setObs] = useState(g?.observaciones ?? '');
  const [modoDesc, setModoDesc] = useState<'escala' | 'fijo'>(
    g && g.descuento_pct !== null ? 'fijo' : 'escala',
  );
  const [descFijo, setDescFijo] = useState<number | string>(g?.descuento_pct ?? 30);
  const [cant, setCant] = useState(
    () => new Map((datos?.renglones ?? []).map((r) => [r.producto_id, r.cantidad])),
  );
  const [manual, setManual] = useState(
    () =>
      new Map(
        (datos?.renglones ?? []).flatMap((r) =>
          r.precio_manual && r.precio_final !== null
            ? [[r.producto_id, r.precio_final] as const]
            : [],
        ),
      ),
  );
  /* Descuento por caja marcado por renglón (D-descuento-caja-1): el % de la
     lista de cajas por defecto, y Ventas lo cambia. Con cuántas unidades van
     en caja (D-caja-mixta-1). */
  const [caja, setCaja] = useState(
    () =>
      new Map<string, CajaRenglon>(
        (datos?.renglones ?? []).flatMap((r) =>
          r.descuento_caja_pct !== null
            ? [
                [
                  r.producto_id,
                  { pct: r.descuento_caja_pct, uds: r.cantidad_caja },
                ] as const,
              ]
            : [],
        ),
      ),
  );
  const [buscar, setBuscar] = useState('');
  const [soloPedido, setSoloPedido] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Cuánto se arma del depósito por producto: lo decide Ventas (sugerido: lo disponible).
  const [deC5, setDeC5] = useState<Record<string, number | string>>({});

  const v = venta.data?.venta;
  // Circuito de 20261019120100: el pedido se edita hasta que Ventas lo
  // aprueba. Con la fecha ya propuesta, cambiar productos o cantidades lo
  // devuelve a Producción para reconfirmar (lo hace la base).
  const editable =
    nuevo || (ESTADOS_SIN_APROBAR as readonly string[]).includes(v?.estado ?? '');
  const etapa = nuevo ? 'BORRADOR' : v!.estado;
  const prop = etapa === 'FECHA_PROPUESTA' ? propuesta.data : null;
  const filas = useMemo(() => lista.data ?? [], [lista.data]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.producto_id, f])), [filas]);
  /* Cajas de aromas (D-armar-caja-1): los productos de la lista con la misma
     caja (descripción, unidades y %); solo las que juntan más de uno. */
  const surtidos = useMemo(() => {
    const grupos = new Map<string, Surtido>();
    for (const [pid, d] of cajas.data ?? []) {
      const f = porId.get(pid);
      if (!f || !d.descripcion) continue;
      const clave = `${d.descripcion}|${d.unidades_caja}|${d.porcentaje}`;
      const g = grupos.get(clave) ?? {
        clave,
        nombre: d.descripcion.replace(/\s*\(aromas\)\s*$/i, ''),
        unidades_caja: d.unidades_caja,
        porcentaje: d.porcentaje,
        productos: [],
      };
      g.productos.push({
        producto_id: pid,
        producto: f.producto,
        codigo: f.codigo_interno,
      });
      grupos.set(clave, g);
    }
    return [...grupos.values()].filter((g) => g.productos.length > 1);
  }, [cajas.data, porId]);
  const deSurtido = useMemo(
    () => new Set(surtidos.flatMap((s) => s.productos.map((p) => p.producto_id))),
    [surtidos],
  );

  const pedidos = useMemo(
    () =>
      [...cant.entries()]
        .filter(([, c]) => c > 0)
        .map(([pid, c]) => ({ f: porId.get(pid), c, pid })),
    [cant, porId],
  );
  const cuenta = useMemo(
    () =>
      calcularVenta(
        pedidos.map(({ f, c, pid }) => ({
          cantidad: c,
          precio_promo: f?.precio_promo ?? 0,
          unidades_pack: f?.unidades_pack ?? 1,
          manual: manual.get(pid) ?? null,
          caja: caja.get(pid)?.pct ?? null,
          cantidad_caja: caja.get(pid)?.uds ?? null,
        })),
        escala.data ?? [],
        modoDesc === 'fijo' ? Number(descFijo) || 0 : null,
      ),
    [pedidos, manual, caja, escala.data, modoDesc, descFijo],
  );
  const sig =
    modoDesc === 'escala' ? proximoEscalon(cuenta.lista, escala.data ?? []) : null;
  const finalDe = (f: FilaLista) =>
    precioFinalRenglon(
      {
        cantidad: cant.get(f.producto_id) ?? 0,
        precio_promo: f.precio_promo,
        unidades_pack: f.unidades_pack,
        manual: manual.get(f.producto_id) ?? null,
        caja: caja.get(f.producto_id)?.pct ?? null,
        cantidad_caja: caja.get(f.producto_id)?.uds ?? null,
      },
      cuenta.descuento,
    );

  const t = buscar.trim().toLowerCase();
  const visibles = filas.filter(
    (f) =>
      (!soloPedido || (cant.get(f.producto_id) ?? 0) > 0) &&
      (!t ||
        f.codigo_interno.toLowerCase().includes(t) ||
        f.producto.toLowerCase().includes(t)),
  );

  const clienteFiscal = (clientes.data ?? []).find(
    (c) => c.razon_social.toLowerCase() === cliente.trim().toLowerCase(),
  );
  const cabecera = () => ({
    cliente: cliente.trim(),
    cliente_id: clienteFiscal?.id ?? v?.cliente_id ?? null,
    fecha_entrega: entrega ? fechaISO(entrega) : null,
    forma_pago: formaPago.trim() || null,
    destino_envio: destino.trim() || null,
    observaciones: obs.trim() || null,
    descuento_pct: modoDesc === 'fijo' ? Number(descFijo) || 0 : null,
    gestionado_por: v?.gestionado_por ?? null,
    deposito_origen_id: origenId,
  });
  const lineas = () =>
    [
      ...new Set([
        ...cant.keys(),
        ...(venta.data?.renglones ?? []).map((r) => r.producto_id),
      ]),
    ].map((pid) => ({
      producto_id: pid,
      cantidad: cant.get(pid) ?? 0,
      manual: manual.get(pid) ?? null,
      caja: caja.get(pid)?.pct ?? null,
      cantidad_caja: caja.get(pid)?.uds ?? null,
    }));
  const guardarBorrador = async () => {
    const nuevoId = await guardar.mutateAsync({
      id,
      cabecera: cabecera(),
      lineas: lineas(),
      previos: venta.data?.renglones ?? [],
    });
    if (nuevo) void navigate(`/ventas/${nuevoId}`, { replace: true });
    return nuevoId;
  };

  const renglonDe = (pid: string) =>
    venta.data?.renglones.find((r) => r.producto_id === pid);

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Group gap="sm">
          <ActionIcon
            component={Link}
            to="/ventas"
            variant="subtle"
            size="lg"
            aria-label="Volver"
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Title order={1}>
              {nuevo ? 'Pedido nuevo' : `${v!.numero} · ${v!.cliente}`}
            </Title>
            {nuevo ? (
              <Text c="dimmed" size="sm">
                Escribí la cantidad en cada producto: el total y el descuento se calculan
                solos.
              </Text>
            ) : (
              <Group gap="xs">
                <Text c="dimmed" size="sm">
                  {fecha(v!.fecha)} · {v!.gestionado ?? ''}
                </Text>
                <BadgeEstadoPedido estado={v!.estado} esVenta />
              </Group>
            )}
          </div>
        </Group>
        <Group gap="sm">
          {!nuevo && !editable ? (
            <Button
              component={Link}
              to={`/pedidos/${id ?? ''}`}
              variant="default"
              leftSection={<IconFileInvoice size={18} />}
            >
              Facturar y ver el despacho
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button
                variant="default"
                loading={guardar.isPending && !pedirFecha.isPending}
                disabled={!cliente.trim()}
                onClick={() => void guardarBorrador()}
              >
                {etapa === 'BORRADOR' ? 'Guardar borrador' : 'Guardar cambios'}
              </Button>
              {etapa === 'BORRADOR' ? (
                <Button
                  leftSection={<IconCalendarEvent size={18} />}
                  disabled={!cliente.trim() || pedidos.length === 0}
                  loading={pedirFecha.isPending}
                  onClick={() =>
                    void (async () => {
                      const pid = await guardarBorrador();
                      await pedirFecha.mutateAsync(pid);
                    })()
                  }
                >
                  Pedir fecha a Producción
                </Button>
              ) : null}
              {etapa === 'FECHA_PROPUESTA' && puedeAprobar ? (
                <Button
                  leftSection={<IconCircleCheck size={18} />}
                  disabled={!cliente.trim() || pedidos.length === 0}
                  onClick={() => setConfirmando(true)}
                >
                  Aprobar
                </Button>
              ) : null}
            </>
          ) : null}
          {/* Descartar: queda cancelado con motivo y libera lo reservado (pedido del 2026-10-27). */}
          {!nuevo && v!.estado !== 'CUMPLIDO' && v!.estado !== 'CANCELADO' ? (
            <Button
              variant="subtle"
              color="estadoRechazado"
              leftSection={<IconTrash size={18} />}
              onClick={() => setDescartando(true)}
            >
              Descartar pedido
            </Button>
          ) : null}
        </Group>
      </Group>

      {etapa === 'ESPERANDO_FECHA' ? (
        <Alert
          color="azul"
          variant="light"
          mb="md"
          icon={<IconCalendarEvent size={20} />}
        >
          Esperando que Gerencia de Producción comprometa una fecha. Mientras tanto podés
          seguir corrigiendo el pedido.
        </Alert>
      ) : null}
      {etapa === 'FECHA_PROPUESTA' && prop ? (
        <Alert
          color="estadoAprobado"
          variant="light"
          mb="md"
          icon={<IconCalendarEvent size={20} />}
          title={`Producción se compromete a entregarlo el ${fecha(prop.fecha_pedido)}`}
        >
          <Stack gap={4}>
            <Text size="sm">
              Lo propuso{' '}
              {nomina.data?.get(prop.propuesta_por) ?? 'Gerencia de Producción'} el{' '}
              {fechaHora(prop.propuesta_en)}.{prop.nota ? ` «${prop.nota}»` : ''}
            </Text>
            {prop.demorados.length ? (
              <Text size="sm">
                Demoran más:{' '}
                {prop.demorados
                  .map((d) => {
                    const r = venta.data?.renglones.find((x) => x.id === d.renglon_id);
                    const nombre = r ? (porId.get(r.producto_id)?.producto ?? '') : '';
                    return `${nombre} (${fecha(d.fecha)})`;
                  })
                  .join(', ')}
                .
              </Text>
            ) : null}
            <Text size="sm" c="dimmed">
              Si la aprobás, el pedido impacta: se reserva lo de {nombreOrigen} y lo que
              falta va a Producción. Si cambiás productos o cantidades, vuelve a
              Producción para reconfirmar la fecha; precio, descuento o forma de pago no.
            </Text>
          </Stack>
        </Alert>
      ) : null}

      {!nuevo && !editable ? (
        <Group gap="sm" mb="md">
          <Badge
            size="lg"
            variant="light"
            color={v!.estado_pago === 'PAGO' ? 'estadoAprobado' : 'orange'}
          >
            {TEXTO_PAGO[v!.estado_pago]}
          </Badge>
          {v!.stock_ok === true ? (
            <Badge size="lg" variant="light" color="estadoAprobado">
              Calle 5: hay ✓
            </Badge>
          ) : v!.stock_ok === false ? (
            <Badge size="lg" variant="light" color="orange">
              Calle 5: {v!.stock_nota}
            </Badge>
          ) : (
            <Badge size="lg" variant="light" color="azul">
              Calle 5 todavía no lo revisó
            </Badge>
          )}
          {v!.pedido_stock ? (
            <Badge size="lg" variant="light" color="indigo">
              {/* Un S-xxxx por producto desde 20261019140000: no se nombra uno solo. */}
              {numero(v!.a_producir)} a producir en Producción
            </Badge>
          ) : null}
          {v!.reservar_calle5 ? (
            <Badge size="lg" variant="light" color="teal">
              reservado en Calle 5
            </Badge>
          ) : null}
        </Group>
      ) : null}

      <Paper
        withBorder
        p="md"
        radius="lg"
        mb="md"
        className="entrada"
        style={{ borderColor: 'var(--superficie-borde)' }}
      >
        <Grid gutter="sm">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Autocomplete
              label="Cliente"
              placeholder="Nombre del cliente"
              data={[...new Set((clientes.data ?? []).map((c) => c.razon_social))]}
              value={cliente}
              onChange={setCliente}
              disabled={!editable}
              description={
                cliente.trim() && !clienteFiscal && editable
                  ? 'No está en el padrón: se puede cargar igual; para facturar hay que darlo de alta.'
                  : undefined
              }
              data-autofocus
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 2 }}>
            <DateInput
              label={editable ? 'Entrega que pide' : 'Entrega'}
              valueFormat="DD/MM/YYYY"
              clearable
              value={entrega}
              onChange={(x) => setEntrega(desdeCalendario(x))}
              disabled={!editable}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, md: 3 }}>
            <Autocomplete
              label="Forma de pago"
              data={FORMAS_PAGO}
              value={formaPago}
              onChange={setFormaPago}
              disabled={!editable}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Descuento del pedido
              </Text>
              <Group gap="xs" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={modoDesc}
                  onChange={(x) => setModoDesc(x as 'escala' | 'fijo')}
                  disabled={!editable}
                  data={[
                    { value: 'escala', label: 'Por monto' },
                    { value: 'fijo', label: 'Fijo' },
                  ]}
                />
                {modoDesc === 'fijo' ? (
                  <NumberInput
                    w={90}
                    suffix=" %"
                    min={0}
                    max={100}
                    value={descFijo}
                    onChange={setDescFijo}
                    disabled={!editable}
                  />
                ) : null}
              </Group>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Select
              label="Sale de"
              description={
                editable ? 'Por defecto, Fábrica o Berna según el cliente' : undefined
              }
              data={DEPOSITOS_VENTA.flatMap((d) => {
                const value = idDeposito(d.numero);
                return value ? [{ value, label: d.etiqueta }] : [];
              })}
              value={origenId}
              onChange={(x) => x && setOrigen(x)}
              allowDeselect={false}
              disabled={!editable}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <TextInput
              label="Destino (envío o retiro)"
              placeholder="Nombre, DNI, domicilio o «retira en el local»"
              value={destino}
              onChange={(e) => setDestino(e.currentTarget.value)}
              disabled={!editable}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Textarea
              label="Observación"
              autosize
              minRows={1}
              value={obs}
              onChange={(e) => setObs(e.currentTarget.value)}
              disabled={!editable}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      <Group mb="sm" gap="sm" wrap="wrap">
        <TextInput
          placeholder="Buscar código o producto"
          leftSection={<IconSearch size={16} />}
          value={buscar}
          onChange={(e) => setBuscar(e.currentTarget.value)}
          w={300}
        />
        <Checkbox
          label={`Solo lo pedido (${pedidos.length})`}
          checked={soloPedido}
          onChange={(e) => setSoloPedido(e.currentTarget.checked)}
        />
        <Text size="xs" c="dimmed">
          Lista {filas[0]?.numero_lista ?? ''} · precios con IVA · los pack se cargan en
          packs
        </Text>
      </Group>

      <Paper
        withBorder
        radius="lg"
        className="entrada"
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        mb={surtidos.length ? 'md' : 110}
      >
        <Table.ScrollContainer minWidth={1240}>
          <Table verticalSpacing={4} horizontalSpacing="xs" stickyHeader fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={110}>Cantidad</Table.Th>
                <Table.Th ta="center">Pack / mín.</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Desc. por caja</Table.Th>
                <Table.Th ta="right">Precio de lista</Table.Th>
                <Table.Th ta="right">% desc.</Table.Th>
                <Table.Th ta="right">Con promoción</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Unitario final</Table.Th>
                <Table.Th ta="right">{nombreOrigen}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibles.map((f, i) => {
                const c = cant.get(f.producto_id) ?? 0;
                const d = dispDe(f.producto_id);
                const r = renglonDe(f.producto_id);
                const bajoMinimo = c > 0 && f.minimo !== null && c < f.minimo;
                const titulo =
                  i === 0 || visibles[i - 1]!.rubro !== f.rubro ? f.rubro : null;
                const cajaR = caja.get(f.producto_id);
                const finalUnidad = precioFinalUnidad(
                  f.precio_promo,
                  cuenta.descuento,
                  cajaR?.pct ?? null,
                );
                // Mixto (D-caja-mixta-1): se muestran los dos precios.
                const mixto =
                  cajaR !== undefined && cajaR.uds !== null && c > 0 && cajaR.uds < c;
                const finalSuelta = precioFinalUnidad(
                  f.precio_promo,
                  cuenta.descuento,
                  null,
                );
                const defCaja = cajas.data?.get(f.producto_id);
                return (
                  <Fragment key={f.producto_id}>
                    {titulo ? (
                      <Table.Tr>
                        <Table.Td colSpan={11} bg="var(--superficie-tenue)">
                          <Text
                            size="xs"
                            fw={800}
                            c="dimmed"
                            tt="uppercase"
                            style={{ letterSpacing: 0.6 }}
                          >
                            {titulo}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                    <Table.Tr
                      style={{
                        background: c > 0 ? 'var(--mantine-color-azul-light)' : undefined,
                      }}
                    >
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={0}
                          allowDecimal={false}
                          hideControls
                          value={c || ''}
                          placeholder="0"
                          disabled={!editable}
                          error={bajoMinimo ? `mín. ${f.minimo}` : undefined}
                          onChange={(x) =>
                            setCant((m) => {
                              const n = new Map(m);
                              n.set(f.producto_id, Number(x) || 0);
                              return n;
                            })
                          }
                          aria-label={`Cantidad de ${f.producto}`}
                        />
                      </Table.Td>
                      <Table.Td ta="center" ff="monospace">
                        {f.unidades_pack > 1 ? (
                          <Tooltip
                            label={`Pack de ${f.unidades_pack}: el precio es ${f.unidades_pack} × unitario`}
                          >
                            <Badge variant="light" color="azul" size="sm">
                              ×{f.unidades_pack}
                            </Badge>
                          </Tooltip>
                        ) : f.minimo && f.minimo > 1 ? (
                          <Text size="xs" c="dimmed">
                            mín. {f.minimo}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td ff="monospace">{f.codigo_interno}</Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1}>
                          {f.producto}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {defCaja && deSurtido.has(f.producto_id) ? (
                          // Los aromas van en cajas armadas abajo (D-armar-caja-1).
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {cajaR && c > 0
                              ? `${numero(Math.min(cajaR.uds ?? c, c))} en caja armada`
                              : 'caja de aromas: armala abajo'}
                          </Text>
                        ) : defCaja ? (
                          <MarcadorCaja
                            def={defCaja}
                            valor={cajaR ?? null}
                            cantidad={c}
                            deshabilitado={!editable}
                            onCambiar={(x) =>
                              setCaja((m) => {
                                const n = new Map(m);
                                if (x === null) n.delete(f.producto_id);
                                else n.set(f.producto_id, x);
                                return n;
                              })
                            }
                          />
                        ) : null}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" c="dimmed">
                        {pesos(f.precio_lista)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" c="dimmed">
                        {f.precio_lista
                          ? pct((f.precio_lista - f.precio_promo) / f.precio_lista)
                          : ''}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={600} c="red">
                        {f.es_regalo ? 'de regalo' : pesos(f.precio_promo)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {c ? pesos(c * f.unidades_pack * f.precio_promo) : ''}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Text
                            size="sm"
                            ff="monospace"
                            fw={manual.has(f.producto_id) ? 800 : 400}
                            c={manual.has(f.producto_id) ? 'azul' : 'inherit'}
                          >
                            {manual.has(f.producto_id)
                              ? `${pesos(manual.get(f.producto_id)! / f.unidades_pack)} a mano`
                              : mixto
                                ? `caja ${pesos(finalUnidad)} · suelta ${pesos(finalSuelta)}`
                                : pesos(finalUnidad)}
                          </Text>
                          {c > 0 ? (
                            <PrecioManual
                              valor={manual.get(f.producto_id) ?? null}
                              sugerido={finalDe(f)}
                              deshabilitado={!editable}
                              onCambiar={(x) =>
                                setManual((m) => {
                                  const n = new Map(m);
                                  if (x === null) n.delete(f.producto_id);
                                  else n.set(f.producto_id, x);
                                  return n;
                                })
                              }
                            />
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td ta="right">
                        {editable ? (
                          <Badge
                            variant="light"
                            color={
                              c === 0
                                ? 'gray'
                                : d >= c
                                  ? 'estadoAprobado'
                                  : d > 0
                                    ? 'orange'
                                    : 'red'
                            }
                          >
                            {numero(d)}
                          </Badge>
                        ) : r ? (
                          <Text size="xs" ff="monospace">
                            {numero(r.de_calle5 ?? 0)} de C5
                            {(r.a_producir ?? 0) > 0
                              ? ` · ${numero(r.a_producir ?? 0)} a producir`
                              : ''}
                          </Text>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  </Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {surtidos.length ? (
        <ArmarCaja
          surtidos={surtidos}
          caja={caja}
          cantidad={(pid) => cant.get(pid) ?? 0}
          deshabilitado={!editable}
          onAgregar={(s, reparto) => {
            const conCaja = new Map(caja);
            const cantNueva = new Map(cant);
            for (const [pid, u] of reparto) {
              if (!u) continue;
              const c = cant.get(pid) ?? 0;
              const r = caja.get(pid);
              conCaja.set(pid, {
                pct: r?.pct ?? s.porcentaje,
                uds: (r ? Math.min(r.uds ?? c, c) : 0) + u,
              });
              cantNueva.set(pid, c + u);
            }
            setCaja(conCaja);
            setCant(cantNueva);
          }}
          onQuitar={(s) =>
            setCaja((m) => {
              const n = new Map(m);
              for (const p of s.productos) n.delete(p.producto_id);
              return n;
            })
          }
        />
      ) : null}

      {/* Pie fijo con la cuenta de la planilla: total, % y total con descuento. */}
      <Paper
        withBorder
        shadow="md"
        radius="lg"
        p="md"
        className="pie-venta no-imprimir"
        style={{ borderColor: 'var(--superficie-borde)' }}
      >
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="xl" wrap="wrap">
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total compra
              </Text>
              <Text fz={20} fw={700} ff="monospace">
                {pesos(cuenta.lista)}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                % descuento
              </Text>
              <Text fz={20} fw={700} ff="monospace" c="indigo">
                {numero(cuenta.descuento)} %
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total con descuento
              </Text>
              <Text fz={28} key={cuenta.total} className="cifra monto-vivo">
                {pesos(cuenta.total)}
              </Text>
            </div>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {sig && pedidos.length ? (
              <Text size="sm" c="dimmed">
                Te faltan <b>{pesos(sig.falta)}</b> para el {numero(sig.porcentaje)} %
              </Text>
            ) : null}
            <Popover withArrow shadow="md" position="top-end">
              <Popover.Target>
                <Button variant="subtle" size="compact-sm">
                  Ver escala
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <TablaEscala monto={cuenta.lista} />
              </Popover.Dropdown>
            </Popover>
          </Group>
        </Group>
      </Paper>

      <Modal
        opened={confirmando}
        onClose={() => setConfirmando(false)}
        title="Aprobar el pedido"
        centered
        size="lg"
      >
        <Stack gap="sm">
          <Text size="sm">
            {prop ? (
              <>
                Se entrega el <b>{fecha(prop.fecha_pedido)}</b>, la fecha que comprometió
                Producción. Al aprobar queda registrado el importe pedido, que es el que
                cuenta en las estadísticas.{' '}
              </>
            ) : null}
            Decidí cuánto se arma de {nombreOrigen} para este cliente (se sugiere lo
            disponible, con lo que Producción ya reservó): eso queda reservado para él. Lo
            que falta va a Producción. El sistema no reparte entre clientes.
          </Text>
          <Table fz="sm" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Pedido</Table.Th>
                <Table.Th ta="right">De {nombreOrigen}</Table.Th>
                <Table.Th ta="right">A producir</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pedidos.map(({ f, c, pid }) => {
                const d = dispDe(pid);
                const tope = Math.min(c, d);
                const de = pid in deC5 ? Math.min(Number(deC5[pid]) || 0, tope) : tope;
                return (
                  <Table.Tr key={pid}>
                    <Table.Td>{f?.producto ?? ''}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(c)}
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        size="xs"
                        w={90}
                        ml="auto"
                        min={0}
                        max={tope}
                        allowDecimal={false}
                        value={de}
                        onChange={(x) => setDeC5((m) => ({ ...m, [pid]: x }))}
                        description={`hay ${numero(d)}`}
                        aria-label={`De ${nombreOrigen} de ${f?.producto ?? ''}`}
                      />
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      ff="monospace"
                      c={c - de > 0 ? 'orange.8' : 'dimmed'}
                    >
                      {numero(c - de)}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmando(false)}>
              Volver
            </Button>
            <Button
              leftSection={<IconCircleCheck size={18} />}
              loading={guardar.isPending || enviar.isPending}
              onClick={() =>
                void (async () => {
                  const pid = await guardarBorrador();
                  await enviar.mutateAsync({
                    id: pid,
                    deCalle5: pedidos.map(({ c, pid: p }) => {
                      const tope = Math.min(c, dispDe(p));
                      return {
                        producto_id: p,
                        cantidad: p in deC5 ? Math.min(Number(deC5[p]) || 0, tope) : tope,
                      };
                    }),
                  });
                  setConfirmando(false);
                })()
              }
            >
              Aprobar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={descartando}
        onClose={() => setDescartando(false)}
        title="Descartar el pedido"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            Queda cancelado, con tu nombre y el motivo, y se libera lo que tenía
            reservado. No se borra: sigue en el historial.
          </Text>
          <Textarea
            label="Motivo"
            placeholder="El cliente no lo quiere más, se cargó dos veces…"
            autosize
            minRows={2}
            value={motivoDescarte}
            onChange={(e) => setMotivoDescarte(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDescartando(false)}>
              Volver
            </Button>
            <Button
              color="estadoRechazado"
              loading={descartar.isPending}
              onClick={() =>
                id &&
                descartar.mutate(
                  { id, motivo: motivoDescarte.trim() || 'Descartado' },
                  { onSuccess: () => void navigate('/ventas') },
                )
              }
            >
              Descartar pedido
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
