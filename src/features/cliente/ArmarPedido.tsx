import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Chip,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useMediaQuery } from '@mantine/hooks';
import {
  IconCheck,
  IconMinus,
  IconPackage,
  IconPlus,
  IconSearch,
  IconShoppingBag,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import SlideCommit from '@/vendor/reactbits/SlideCommit';
import HoldButton from '@/vendor/reactbits/HoldButton';
import { numero } from '@/lib/formato';
import { normalizarNombre } from '@/lib/consultasVentas';
import { TextoDual } from './TextoDual';
import { TarjetaCaja } from './CajasAromas';
import {
  calcularVenta,
  precioFinalUnidad,
  proximoEscalon,
  type Escalon,
} from '@/lib/consultasVentas';
import {
  etiquetaOpcion,
  textoCajas,
  partirClaveCaja,
  useCajasCliente,
  useEnviarPedidoCliente,
  useEscalaCliente,
  useListaCliente,
  type CajaCliente,
  type CarritoCajas,
  type EnvioPedido,
  type ProductoCliente,
} from '@/lib/consultasCliente';

export type Carrito = Map<string, number>;

const pesos = (n: number) => `$${numero(n, 0)}`;

/** Lo que cuesta el carrito con la escala de descuentos, igual que en Ventas. */
function useCuenta(
  carrito: Carrito,
  lista: ProductoCliente[],
  escala: Escalon[],
  cajas: CarritoCajas,
  catalogo: CajaCliente[],
) {
  return useMemo(() => {
    const porId = new Map(lista.map((p) => [p.producto_id, p]));
    const sueltas = [...carrito]
      .filter(([pid, c]) => c > 0 && porId.has(pid))
      .map(([pid, c]) => ({
        cantidad: c,
        precio_promo: porId.get(pid)!.precio_promo,
        unidades_pack: 1,
        manual: null,
      }));
    // Una caja vale precio_promo × unidades de la caja, con su % de caja (como calcularVenta).
    const porCaja = new Map(catalogo.map((c) => [c.caja_id, c]));
    const deCajas = [...cajas]
      .filter(([k, c]) => c > 0 && porCaja.has(partirClaveCaja(k).caja_id))
      .map(([k, c]) => {
        const g = porCaja.get(partirClaveCaja(k).caja_id)!;
        return {
          cantidad: c * g.unidades_caja,
          precio_promo: g.precio_promo,
          unidades_pack: 1,
          manual: null,
          caja: g.porcentaje,
          cantidad_caja: c * g.unidades_caja,
        };
      });
    const lineas = [...sueltas, ...deCajas];
    const cuenta = calcularVenta(lineas, escala, null);
    const proximo = proximoEscalon(cuenta.lista, escala);
    const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
    return { ...cuenta, proximo, unidades, productos: lineas.length };
  }, [carrito, lista, escala, cajas, catalogo]);
}

export function ArmarPedido({
  carrito,
  setCarrito,
  cajas,
  setCajas,
  cajasDemo,
  observaciones,
  setObservaciones,
  editando,
  onVaciar,
  onEnviado,
  enviarDemo,
}: {
  carrito: Carrito;
  setCarrito: Dispatch<SetStateAction<Carrito>>;
  cajas: CarritoCajas;
  setCajas: Dispatch<SetStateAction<CarritoCajas>>;
  /** Cuenta de demostración: las cajas vienen de demo.ts, no de la base. */
  cajasDemo?: CajaCliente[] | undefined;
  observaciones: string;
  setObservaciones: (v: string) => void;
  editando: { id: string; numero: string } | null;
  onVaciar: () => void;
  onEnviado: () => void;
  /** Modo demostración: el envío no va a la base (20261112130000). */
  enviarDemo?: ((e: EnvioPedido) => Promise<unknown>) | undefined;
}) {
  const lista = useListaCliente();
  const escala = useEscalaCliente();
  const consultaCajas = useCajasCliente(!cajasDemo);
  const catalogo = useMemo(
    () => cajasDemo ?? consultaCajas.data ?? [],
    [cajasDemo, consultaCajas.data],
  );
  const [busqueda, setBusqueda] = useState('');
  const [buscar] = useDebouncedValue(busqueda, 150);
  const [rubro, setRubro] = useState<string | null>(null);
  const [soloMios, setSoloMios] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [festejo, setFestejo] = useState(false);

  const productos = useMemo(() => lista.data ?? [], [lista.data]);
  const cuenta = useCuenta(carrito, productos, escala.data ?? [], cajas, catalogo);
  const rubros = useMemo(
    () => [...new Set(productos.map((p) => p.rubro).filter(Boolean))] as string[],
    [productos],
  );

  const cajasVisibles = useMemo(() => {
    if (rubro) return [];
    const palabras = normalizarNombre(buscar).split(' ').filter(Boolean);
    return catalogo.filter((g) => {
      if (
        soloMios &&
        ![...cajas].some(([k, c]) => c > 0 && k.startsWith(`${g.caja_id}|`))
      )
        return false;
      const texto = normalizarNombre(`${g.nombre} caja cajas`);
      return palabras.every((w) => texto.includes(w));
    });
  }, [catalogo, buscar, rubro, soloMios, cajas]);

  const visibles = useMemo(() => {
    // Sin tildes ni mayúsculas; los alias («crema», «cremas») cuentan como texto (P2).
    const palabras = normalizarNombre(buscar).split(' ').filter(Boolean);
    return productos.filter((p) => {
      if (soloMios && !(carrito.get(p.producto_id) ?? 0)) return false;
      if (rubro && p.rubro !== rubro) return false;
      if (!palabras.length) return true;
      const texto = normalizarNombre(
        `${p.producto} ${p.codigo} ${p.rubro ?? ''} ${p.alias.join(' ')}`,
      );
      return palabras.every((w) => texto.includes(w));
    });
  }, [productos, buscar, rubro, soloMios, carrito]);

  const cambiar = (pid: string, cantidad: number) =>
    setCarrito((m) => {
      const n = new Map(m);
      const c = Math.max(0, Math.min(100000, Math.round(cantidad || 0)));
      if (c === 0) n.delete(pid);
      else n.set(pid, c);
      return n;
    });

  const cambiarCaja = (clave: string, cantidad: number) =>
    setCajas((m) => {
      const n = new Map(m);
      const c = Math.max(0, Math.min(10000, Math.round(cantidad || 0)));
      if (c === 0) n.delete(clave);
      else n.set(clave, c);
      return n;
    });

  if (lista.isLoading || escala.isLoading || consultaCajas.isLoading) {
    return (
      <Stack p="md" gap="sm">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} h={104} radius={18} />
        ))}
      </Stack>
    );
  }

  return (
    <>
      <Box className="cli-buscador" px="md" pt="sm" pb={6}>
        <TextInput
          size="lg"
          radius="xl"
          placeholder="Buscá por nombre o código"
          leftSection={<IconSearch size={20} />}
          rightSection={
            busqueda ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setBusqueda('')}
                aria-label="Borrar búsqueda"
              >
                <IconX size={18} />
              </ActionIcon>
            ) : null
          }
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
          inputMode="search"
          enterKeyHint="search"
        />
        <div className="cli-chips" style={{ marginTop: 10 }}>
          <Chip
            size="md"
            color="grape"
            checked={soloMios}
            onChange={setSoloMios}
            disabled={cuenta.productos === 0}
          >
            Lo que llevo ({cuenta.productos})
          </Chip>
          <Chip
            size="md"
            color="grape"
            variant="light"
            checked={rubro === null}
            onChange={() => setRubro(null)}
          >
            Todo
          </Chip>
          {rubros.map((r) => (
            <Chip
              key={r}
              size="md"
              color="grape"
              variant="light"
              checked={rubro === r}
              onChange={() => setRubro(rubro === r ? null : r)}
              style={{ flexShrink: 0 }}
            >
              {r}
            </Chip>
          ))}
        </div>
      </Box>

      <Stack
        gap={10}
        px="md"
        pt="xs"
        {...(cuenta.productos ? {} : { pb: 40 })}
        {...(cuenta.productos ? { className: 'cli-pie-barra' } : {})}
      >
        {cajasVisibles.map((g) => (
          <TarjetaCaja
            key={g.caja_id}
            caja={g}
            descuento={cuenta.descuento}
            cantidades={cajas}
            onCambiar={cambiarCaja}
          />
        ))}
        {visibles.length === 0 && cajasVisibles.length === 0 ? (
          <Center py={60}>
            <Stack align="center" gap={6}>
              <IconSearch size={36} opacity={0.4} />
              <Text c="dimmed">No encontramos «{busqueda}». Probá con otra palabra.</Text>
            </Stack>
          </Center>
        ) : (
          visibles.map((p) => (
            <TarjetaProducto
              key={p.producto_id}
              p={p}
              cantidad={carrito.get(p.producto_id) ?? 0}
              descuento={cuenta.descuento}
              onCambiar={cambiar}
            />
          ))
        )}
      </Stack>

      {cuenta.productos > 0 ? (
        <BarraTotal cuenta={cuenta} onAbrir={() => setAbierto(true)} />
      ) : null}

      <Drawer
        opened={abierto}
        onClose={() => setAbierto(false)}
        position="bottom"
        size="92%"
        radius="xl"
        className="cli-portal"
        title={
          <Text fw={800} size="lg">
            {editando ? `Tu pedido ${editando.numero}` : 'Tu pedido'}
          </Text>
        }
      >
        <ResumenPedido
          enviarDemo={enviarDemo}
          productos={productos}
          carrito={carrito}
          catalogo={catalogo}
          cajasError={!cajasDemo && consultaCajas.isError}
          cajas={cajas}
          onCambiarCaja={cambiarCaja}
          cuenta={cuenta}
          onCambiar={cambiar}
          observaciones={observaciones}
          setObservaciones={setObservaciones}
          editando={editando}
          onVaciar={() => {
            onVaciar();
            setAbierto(false);
          }}
          onEnviado={() => {
            setAbierto(false);
            setFestejo(true);
          }}
        />
      </Drawer>

      <Festejo
        abierto={festejo}
        editado={editando !== null}
        onCerrar={() => {
          setFestejo(false);
          onEnviado();
        }}
      />
    </>
  );
}

type Cuenta = ReturnType<typeof useCuenta>;

/** Botones de ícono de 44 px fijos: no crecen con el texto del sistema. */
const PX44 = { '--ai-size': '44px' } as CSSProperties;

const TarjetaProducto = memo(function TarjetaProducto({
  p,
  cantidad,
  descuento,
  onCambiar,
}: {
  p: ProductoCliente;
  cantidad: number;
  descuento: number;
  onCambiar: (pid: string, c: number) => void;
}) {
  const final = precioFinalUnidad(p.precio_promo, descuento, null);
  return (
    <Box className="cli-tarjeta" data-elegido={cantidad > 0} p="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={700} lh={1.25}>
            {p.producto}
          </Text>
          <Group gap={6} mt={2}>
            <Text size="xs" c="dimmed" ff="monospace">
              {p.codigo}
            </Text>
            {p.pack ? (
              <Badge size="xs" variant="light" color="grape">
                pack de {p.pack}
              </Badge>
            ) : null}
          </Group>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Text fw={800} size="lg" lh={1.1}>
            {pesos(final)}
          </Text>
          {descuento > 0 && final < p.precio_promo ? (
            <Text size="xs" c="dimmed" td="line-through">
              {pesos(p.precio_promo)}
            </Text>
          ) : (
            <Text size="xs" c="dimmed">
              c/u
            </Text>
          )}
        </div>
      </Group>
      <Group mt="sm" justify="space-between" gap={8}>
        {p.pack ? (
          <Button
            variant="light"
            color="grape"
            radius="xl"
            size="md"
            leftSection={<IconPackage size={18} />}
            onClick={() => onCambiar(p.producto_id, cantidad + p.pack!)}
          >
            + Pack
          </Button>
        ) : (
          <span />
        )}
        <Group gap={6} wrap="nowrap" ml="auto">
          <ActionIcon
            style={PX44}
            radius="xl"
            variant="light"
            color="gray"
            disabled={cantidad === 0}
            onClick={() => onCambiar(p.producto_id, cantidad - 1)}
            aria-label={`Uno menos de ${p.producto}`}
          >
            <IconMinus size={22} />
          </ActionIcon>
          <NumberInput
            classNames={{ input: 'cli-cantidad' }}
            style={{ width: 64, flexShrink: 0 }}
            size="md"
            radius="md"
            hideControls
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            placeholder="0"
            value={cantidad || ''}
            onChange={(v) => onCambiar(p.producto_id, Number(v) || 0)}
            aria-label={`Cantidad de ${p.producto}`}
          />
          <ActionIcon
            style={PX44}
            radius="xl"
            color="grape"
            onClick={() => onCambiar(p.producto_id, cantidad + 1)}
            aria-label={`Uno más de ${p.producto}`}
          >
            <IconPlus size={22} />
          </ActionIcon>
        </Group>
      </Group>
    </Box>
  );
});

/** Próximo escalón de descuento, badge y barra de avance. Va en la barra (tablet) y en el resumen (celular). */
function AvisoEscala({ cuenta }: { cuenta: Cuenta }) {
  const avance = cuenta.proximo
    ? Math.min(100, (cuenta.lista / (cuenta.lista + cuenta.proximo.falta)) * 100)
    : 100;
  return (
    <>
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Text size="sm" fw={600} lh={1.2}>
          {cuenta.proximo ? (
            <>
              Sumá <b>{pesos(cuenta.proximo.falta)}</b> y llegás al{' '}
              <b>{numero(cuenta.proximo.porcentaje, 0)} %</b>
            </>
          ) : (
            <>
              <IconSparkles size={14} /> ¡Tenés el mayor descuento!
            </>
          )}
        </Text>
        {cuenta.descuento > 0 ? (
          <span key={cuenta.descuento} className="cli-descuento cli-pop">
            −{numero(cuenta.descuento, 0)} %
          </span>
        ) : null}
      </Group>
      <div className="cli-progreso">
        <div style={{ transform: `scaleX(${avance / 100})` }} />
      </div>
    </>
  );
}

function BarraTotal({ cuenta, onAbrir }: { cuenta: Cuenta; onAbrir: () => void }) {
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const raiz = document.documentElement.style;
    const medir = () => raiz.setProperty('--cli-barra-h', `${el.offsetHeight}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      ro.disconnect();
      raiz.removeProperty('--cli-barra-h');
    };
  }, []);
  return (
    <div className="cli-barra" ref={barra}>
      {/* En celular el aviso de escala va en el resumen: la barra queda en una línea. */}
      <div className="cli-barra-aviso">
        <AvisoEscala cuenta={cuenta} />
      </div>
      <Button
        fullWidth
        size="xl"
        radius="xl"
        color="grape"
        onClick={onAbrir}
        leftSection={<IconShoppingBag size={22} />}
        rightSection={
          <Text fw={900} size="lg" key={cuenta.total} className="cli-pop">
            {pesos(cuenta.total)}
          </Text>
        }
        justify="space-between"
      >
        Ver pedido · {numero(cuenta.unidades, 0)} u
      </Button>
    </div>
  );
}

function ResumenPedido({
  productos,
  carrito,
  catalogo,
  cajasError,
  cajas,
  onCambiarCaja,
  cuenta,
  onCambiar,
  observaciones,
  setObservaciones,
  editando,
  onVaciar,
  onEnviado,
  enviarDemo,
}: {
  productos: ProductoCliente[];
  carrito: Carrito;
  catalogo: CajaCliente[];
  /** cliente_cajas falló: no se sabe qué cajas hay, así que no se tocan las del pedido. */
  cajasError: boolean;
  cajas: CarritoCajas;
  onCambiarCaja: (clave: string, c: number) => void;
  cuenta: Cuenta;
  onCambiar: (pid: string, c: number) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  editando: { id: string; numero: string } | null;
  onVaciar: () => void;
  onEnviado: () => void;
  enviarDemo?: ((e: EnvioPedido) => Promise<unknown>) | undefined;
}) {
  const enviar = useEnviarPedidoCliente();
  const { ref, width } = useElementSize();
  // Celular: más alto para que «Deslizá…» entre en dos renglones.
  const alto = useMediaQuery('(max-width: 420px)') ? 64 : 56;
  const porId = new Map(productos.map((p) => [p.producto_id, p]));
  const items = [...carrito].filter(([pid, c]) => c > 0 && porId.has(pid));
  const porCaja = new Map(catalogo.map((g) => [g.caja_id, g]));
  const delCarrito = [...cajas]
    .map(([clave, c]) => ({ clave, c, ...partirClaveCaja(clave) }))
    .filter((x) => x.c > 0);
  const itemsCajas = delCarrito.filter((x) => porCaja.has(x.caja_id));
  // Una caja que ya no está en la lista no se descarta en silencio: se muestra y frena el envío.
  const faltantes = cajasError ? [] : delCarrito.filter((x) => !porCaja.has(x.caja_id));
  const sinCajas = cajasError && delCarrito.length > 0;
  const bloqueado = sinCajas || faltantes.length > 0;

  if (items.length === 0 && delCarrito.length === 0) {
    return (
      <Center py={60}>
        <Text c="dimmed">Tu pedido está vacío.</Text>
      </Center>
    );
  }

  return (
    <Stack gap="md" pb="xl">
      <Stack gap={8}>
        {sinCajas ? (
          <Text size="sm" c="red" fw={600} role="alert">
            No pudimos cargar las cajas. Probá de nuevo en un rato.
          </Text>
        ) : null}
        {faltantes.map(({ clave, c, opcion }) => (
          <Group key={clave} gap={4} wrap="nowrap" justify="space-between">
            <div style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" c="red" lh={1.25}>
                Caja que ya no está en la lista · {etiquetaOpcion(opcion)}
              </Text>
              <Text size="xs" c="dimmed">
                {textoCajas(opcion, c)}. Sacala para poder enviar el pedido.
              </Text>
            </div>
            <ActionIcon
              style={PX44}
              radius="xl"
              variant="subtle"
              color="red"
              onClick={() => onCambiarCaja(clave, 0)}
              aria-label="Sacar caja que ya no está en la lista"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        {itemsCajas.map(({ clave, c, caja_id, opcion }) => {
          const g = porCaja.get(caja_id)!;
          const paso = opcion === 'UNA_DE_CADA' ? 3 : 1;
          const final =
            precioFinalUnidad(g.precio_promo, cuenta.descuento, g.porcentaje) *
            g.unidades_caja;
          const que = `${g.nombre}, ${etiquetaOpcion(opcion)}`;
          return (
            <Stack key={clave} gap={4}>
              <div style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lh={1.25} lineClamp={2}>
                  {g.nombre} · {etiquetaOpcion(opcion)}
                </Text>
                <Text size="xs" c="dimmed">
                  {textoCajas(opcion, c)} × {pesos(final)} = <b>{pesos(c * final)}</b>
                </Text>
              </div>
              <Group gap={4} wrap="wrap" justify="flex-end">
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  variant="light"
                  color="gray"
                  onClick={() => onCambiarCaja(clave, c - paso)}
                  aria-label={`Menos de ${que}`}
                >
                  <IconMinus size={18} />
                </ActionIcon>
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  color="grape"
                  onClick={() => onCambiarCaja(clave, c + paso)}
                  aria-label={`Más de ${que}`}
                >
                  <IconPlus size={18} />
                </ActionIcon>
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  variant="subtle"
                  color="red"
                  onClick={() => onCambiarCaja(clave, 0)}
                  aria-label={`Sacar ${que}`}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Stack>
          );
        })}
        {items.map(([pid, c]) => {
          const p = porId.get(pid)!;
          const final = precioFinalUnidad(p.precio_promo, cuenta.descuento, null);
          return (
            <Stack key={pid} gap={4}>
              <div style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lh={1.25} lineClamp={2}>
                  {p.producto}
                </Text>
                <Text size="xs" c="dimmed">
                  {numero(c, 0)} × {pesos(final)} = <b>{pesos(c * final)}</b>
                </Text>
              </div>
              <Group gap={4} wrap="wrap" justify="flex-end">
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  variant="light"
                  color="gray"
                  onClick={() => onCambiar(pid, c - 1)}
                  aria-label={`Uno menos de ${p.producto}`}
                >
                  <IconMinus size={18} />
                </ActionIcon>
                <Text fw={800} miw={40} ta="center">
                  {numero(c, 0)}
                </Text>
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  color="grape"
                  onClick={() => onCambiar(pid, c + 1)}
                  aria-label={`Uno más de ${p.producto}`}
                >
                  <IconPlus size={18} />
                </ActionIcon>
                <ActionIcon
                  style={PX44}
                  radius="xl"
                  variant="subtle"
                  color="red"
                  onClick={() => onCambiar(pid, 0)}
                  aria-label={`Sacar ${p.producto}`}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Stack>
          );
        })}
      </Stack>

      <div className="cli-aviso-resumen">
        <AvisoEscala cuenta={cuenta} />
      </div>

      <Box
        p="md"
        style={{
          borderRadius: 18,
          background: 'var(--mantine-color-grape-light)',
        }}
      >
        <Group justify="space-between">
          <Text size="sm">Precio de lista</Text>
          <Text size="sm">{pesos(cuenta.lista)}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm">
            Tu descuento{' '}
            {cuenta.descuento > 0 ? `(${numero(cuenta.descuento, 0)} %)` : ''}
          </Text>
          <Text size="sm" c="grape.8" fw={700}>
            −{pesos(cuenta.lista - cuenta.total)}
          </Text>
        </Group>
        <Group justify="space-between" mt={6}>
          <Text fw={900} size="xl">
            Total
          </Text>
          <Text fw={900} size="xl">
            {pesos(cuenta.total)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mt={4}>
          Precios con IVA. Ventas confirma el total al aprobar el pedido.
        </Text>
      </Box>

      <Textarea
        label="¿Algo que tengamos que saber?"
        placeholder="Horario de entrega, dirección, lo que quieras"
        autosize
        minRows={2}
        maxLength={1000}
        size="md"
        value={observaciones}
        onChange={(e) => setObservaciones(e.currentTarget.value)}
      />

      <div ref={ref}>
        {width > 0 && !bloqueado ? (
          <SlideCommit
            label={
              editando
                ? 'Deslizá para guardar los cambios'
                : 'Deslizá para enviar el pedido'
            }
            doneLabel="¡Listo!"
            errorLabel="No salió, probá de nuevo"
            className="cli-slide"
            width={width}
            height={alto}
            radius={alto / 2}
            trackColor="#f3e8f8"
            handleColor="#be4bdb"
            successColor="#2f9e44"
            holdMs={500}
            onConfirm={() =>
              (enviarDemo ?? enviar.mutateAsync)({
                id: editando?.id ?? null,
                renglones: items.map(([producto_id, cantidad]) => ({
                  producto_id,
                  cantidad,
                })),
                // Sin cajas y con la consulta caída: null = no tocar las del pedido.
                cajas:
                  cajasError && delCarrito.length === 0
                    ? null
                    : itemsCajas.map((x) => ({
                        caja_id: x.caja_id,
                        opcion: x.opcion,
                        cajas: x.c,
                      })),
                observaciones,
              })
            }
            onDone={onEnviado}
          />
        ) : null}
      </div>

      <HoldButton
        size="md"
        className="cli-hold"
        holdTime={900}
        releaseTime={150}
        backgroundColor="#fdecec"
        textColor="#c92a2a"
        fillColor="#e03131"
        fillTextColor="#ffffff"
        doneLabel="Vaciado"
        icon={<IconTrash size={18} />}
        resetAfter={0}
        onHold={onVaciar}
      >
        {editando ? (
          <TextoDual
            corto="Mantené para descartar"
            largo="Mantené apretado para descartar los cambios"
          />
        ) : (
          <TextoDual
            corto="Mantené para borrar todo"
            largo="Mantené apretado para borrar todo"
          />
        )}
      </HoldButton>
    </Stack>
  );
}

const COLORES = ['#be4bdb', '#4dabf7', '#ffd43b', '#ff8787', '#69db7c', '#9775fa'];

function Festejo({
  abierto,
  editado,
  onCerrar,
}: {
  abierto: boolean;
  editado: boolean;
  onCerrar: () => void;
}) {
  // Confeti fijo por render: posiciones al azar, una vez por apertura.
  const [piezas] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: COLORES[i % COLORES.length]!,
    })),
  );
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      fullScreen
      withCloseButton={false}
      className="cli-portal"
    >
      {abierto
        ? piezas.map((p, i) => (
            <span
              key={i}
              className="cli-confeti"
              style={{
                left: `${p.left}%`,
                background: p.color,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))
        : null}
      <Center h="90dvh">
        <Stack align="center" gap="lg" ta="center" className="cli-festejo" maw={340}>
          <ThemeIcon size={110} radius={999} color="teal">
            <IconCheck size={64} />
          </ThemeIcon>
          <Title order={1}>{editado ? '¡Cambios guardados!' : '¡Pedido enviado!'}</Title>
          <Text size="lg">
            Ya le llegó a Ventas. En «Mis pedidos» ves en qué está y, mientras lo revisan,
            podés corregirlo.
          </Text>
          <Button size="xl" radius="xl" color="grape" onClick={onCerrar}>
            Ver mis pedidos
          </Button>
        </Stack>
      </Center>
    </Modal>
  );
}
