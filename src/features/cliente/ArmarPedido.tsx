import { memo, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
import { useDebouncedValue, useElementSize } from '@mantine/hooks';
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
import {
  calcularVenta,
  precioFinalUnidad,
  proximoEscalon,
  type Escalon,
} from '@/lib/consultasVentas';
import {
  useEnviarPedidoCliente,
  useEscalaCliente,
  useListaCliente,
  type ProductoCliente,
} from '@/lib/consultasCliente';

export type Carrito = Map<string, number>;

const pesos = (n: number) => `$${numero(n, 0)}`;

/** Lo que cuesta el carrito con la escala de descuentos, igual que en Ventas. */
function useCuenta(carrito: Carrito, lista: ProductoCliente[], escala: Escalon[]) {
  return useMemo(() => {
    const porId = new Map(lista.map((p) => [p.producto_id, p]));
    const lineas = [...carrito]
      .filter(([pid, c]) => c > 0 && porId.has(pid))
      .map(([pid, c]) => ({
        cantidad: c,
        precio_promo: porId.get(pid)!.precio_promo,
        unidades_pack: 1,
        manual: null,
      }));
    const cuenta = calcularVenta(lineas, escala, null);
    const proximo = proximoEscalon(cuenta.lista, escala);
    const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
    return { ...cuenta, proximo, unidades, productos: lineas.length };
  }, [carrito, lista, escala]);
}

export function ArmarPedido({
  carrito,
  setCarrito,
  observaciones,
  setObservaciones,
  editando,
  onVaciar,
  onEnviado,
}: {
  carrito: Carrito;
  setCarrito: Dispatch<SetStateAction<Carrito>>;
  observaciones: string;
  setObservaciones: (v: string) => void;
  editando: { id: string; numero: string } | null;
  onVaciar: () => void;
  onEnviado: () => void;
}) {
  const lista = useListaCliente();
  const escala = useEscalaCliente();
  const [busqueda, setBusqueda] = useState('');
  const [buscar] = useDebouncedValue(busqueda, 150);
  const [rubro, setRubro] = useState<string | null>(null);
  const [soloMios, setSoloMios] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [festejo, setFestejo] = useState(false);

  const productos = useMemo(() => lista.data ?? [], [lista.data]);
  const cuenta = useCuenta(carrito, productos, escala.data ?? []);
  const rubros = useMemo(
    () => [...new Set(productos.map((p) => p.rubro).filter(Boolean))] as string[],
    [productos],
  );

  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    const palabras = t.split(/\s+/).filter(Boolean);
    return productos.filter((p) => {
      if (soloMios && !(carrito.get(p.producto_id) ?? 0)) return false;
      if (rubro && p.rubro !== rubro) return false;
      if (!palabras.length) return true;
      const texto = `${p.producto} ${p.codigo} ${p.rubro ?? ''}`.toLowerCase();
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

  if (lista.isLoading || escala.isLoading) {
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

      <Stack gap={10} px="md" pt="xs" pb={cuenta.productos ? 190 : 40}>
        {visibles.length === 0 ? (
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
        title={
          <Text fw={800} size="lg">
            {editando ? `Tu pedido ${editando.numero}` : 'Tu pedido'}
          </Text>
        }
      >
        <ResumenPedido
          productos={productos}
          carrito={carrito}
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
      <Group mt="sm" justify="space-between" wrap="nowrap" gap={8}>
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
        <Group gap={6} wrap="nowrap">
          <ActionIcon
            size={46}
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
            w={64}
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
            size={46}
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

function BarraTotal({ cuenta, onAbrir }: { cuenta: Cuenta; onAbrir: () => void }) {
  const avance = cuenta.proximo
    ? Math.min(100, (cuenta.lista / (cuenta.lista + cuenta.proximo.falta)) * 100)
    : 100;
  return (
    <div className="cli-barra">
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
      <Button
        fullWidth
        mt={10}
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
  cuenta,
  onCambiar,
  observaciones,
  setObservaciones,
  editando,
  onVaciar,
  onEnviado,
}: {
  productos: ProductoCliente[];
  carrito: Carrito;
  cuenta: Cuenta;
  onCambiar: (pid: string, c: number) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  editando: { id: string; numero: string } | null;
  onVaciar: () => void;
  onEnviado: () => void;
}) {
  const enviar = useEnviarPedidoCliente();
  const { ref, width } = useElementSize();
  const porId = new Map(productos.map((p) => [p.producto_id, p]));
  const items = [...carrito].filter(([pid, c]) => c > 0 && porId.has(pid));

  if (items.length === 0) {
    return (
      <Center py={60}>
        <Text c="dimmed">Tu pedido está vacío.</Text>
      </Center>
    );
  }

  return (
    <Stack gap="md" pb="xl">
      <Stack gap={8}>
        {items.map(([pid, c]) => {
          const p = porId.get(pid)!;
          const final = precioFinalUnidad(p.precio_promo, cuenta.descuento, null);
          return (
            <Group key={pid} justify="space-between" wrap="nowrap" gap="xs">
              <div style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" lh={1.25} lineClamp={2}>
                  {p.producto}
                </Text>
                <Text size="xs" c="dimmed">
                  {numero(c, 0)} × {pesos(final)} = <b>{pesos(c * final)}</b>
                </Text>
              </div>
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  size={40}
                  radius="xl"
                  variant="light"
                  color="gray"
                  onClick={() => onCambiar(pid, c - 1)}
                  aria-label={`Uno menos de ${p.producto}`}
                >
                  <IconMinus size={18} />
                </ActionIcon>
                <Text fw={800} w={40} ta="center">
                  {numero(c, 0)}
                </Text>
                <ActionIcon
                  size={40}
                  radius="xl"
                  color="grape"
                  onClick={() => onCambiar(pid, c + 1)}
                  aria-label={`Uno más de ${p.producto}`}
                >
                  <IconPlus size={18} />
                </ActionIcon>
                <ActionIcon
                  size={40}
                  radius="xl"
                  variant="subtle"
                  color="red"
                  onClick={() => onCambiar(pid, 0)}
                  aria-label={`Sacar ${p.producto}`}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Group>
          );
        })}
      </Stack>

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
        {width > 0 ? (
          <SlideCommit
            label={
              editando
                ? 'Deslizá para guardar los cambios'
                : 'Deslizá para enviar el pedido'
            }
            doneLabel="¡Listo!"
            errorLabel="No salió, probá de nuevo"
            width={width}
            height={64}
            radius={32}
            trackColor="#f3e8f8"
            handleColor="#be4bdb"
            successColor="#2f9e44"
            holdMs={500}
            onConfirm={() =>
              enviar.mutateAsync({
                id: editando?.id ?? null,
                renglones: items.map(([producto_id, cantidad]) => ({
                  producto_id,
                  cantidad,
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
        {editando
          ? 'Mantené apretado para descartar los cambios'
          : 'Mantené apretado para borrar todo'}
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
    <Modal opened={abierto} onClose={onCerrar} fullScreen withCloseButton={false}>
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
