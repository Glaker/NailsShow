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
  IconFileInvoice,
  IconPencil,
  IconSearch,
  IconSend,
} from '@tabler/icons-react';
import { useClientes } from '@/lib/consultasFacturacion';
import { TablaEscala } from './TablaEscala';
import { fecha, fechaISO, numero } from '@/lib/formato';
import {
  FORMAS_PAGO,
  TEXTO_PAGO,
  calcularVenta,
  proximoEscalon,
  useDisponibleCalle5,
  useEnviarVenta,
  useEscalaDescuento,
  useGuardarVenta,
  useListaMayorista,
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
  const disponible = useDisponibleCalle5();
  const clientes = useClientes();
  const venta = useVenta(id ?? undefined);
  const guardar = useGuardarVenta();
  const enviar = useEnviarVenta();

  const g = datos?.venta;
  const [cliente, setCliente] = useState(g?.cliente ?? '');
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
  const [buscar, setBuscar] = useState('');
  const [soloPedido, setSoloPedido] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Cuánto se arma de Calle 5 por producto: lo decide Ventas (sugerido: lo disponible).
  const [deC5, setDeC5] = useState<Record<string, number | string>>({});

  const v = venta.data?.venta;
  const editable = nuevo || v?.estado === 'BORRADOR';
  const filas = useMemo(() => lista.data ?? [], [lista.data]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.producto_id, f])), [filas]);

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
        })),
        escala.data ?? [],
        modoDesc === 'fijo' ? Number(descFijo) || 0 : null,
      ),
    [pedidos, manual, escala.data, modoDesc, descFijo],
  );
  const sig =
    modoDesc === 'escala' ? proximoEscalon(cuenta.lista, escala.data ?? []) : null;
  const finalDe = (f: FilaLista) =>
    manual.get(f.producto_id) ??
    Math.round(f.precio_promo * (1 - cuenta.descuento / 100)) * f.unidades_pack;

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
            <Text c="dimmed" size="sm">
              {nuevo
                ? 'Escribí la cantidad en cada producto: el total y el descuento se calculan solos.'
                : `${fecha(v!.fecha)} · ${v!.gestionado ?? ''} · ${editable ? 'borrador' : v!.estado.toLowerCase()}`}
            </Text>
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
                loading={guardar.isPending}
                disabled={!cliente.trim()}
                onClick={() => void guardarBorrador()}
              >
                Guardar borrador
              </Button>
              <Button
                leftSection={<IconSend size={18} />}
                disabled={!cliente.trim() || pedidos.length === 0}
                onClick={() => setConfirmando(true)}
              >
                Enviar
              </Button>
            </>
          ) : null}
        </Group>
      </Group>

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
            <Badge size="lg" variant="light" color="violeta">
              Calle 5 todavía no lo revisó
            </Badge>
          )}
          {v!.pedido_stock ? (
            <Badge size="lg" variant="light" color="indigo">
              {numero(v!.a_producir)} a producir en {v!.pedido_stock}
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
              label="Entrega"
              valueFormat="DD/MM/YYYY"
              clearable
              value={entrega}
              onChange={(x) => setEntrega(x ? new Date(x) : null)}
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
          <Grid.Col span={{ base: 12, md: 6 }}>
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
        mb={110}
      >
        <Table.ScrollContainer minWidth={1100}>
          <Table verticalSpacing={4} horizontalSpacing="xs" stickyHeader fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={110}>Cantidad</Table.Th>
                <Table.Th ta="center">Pack / mín.</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Precio de lista</Table.Th>
                <Table.Th ta="right">% desc.</Table.Th>
                <Table.Th ta="right">Con promoción</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Unitario final</Table.Th>
                <Table.Th ta="right">Calle 5</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibles.map((f, i) => {
                const c = cant.get(f.producto_id) ?? 0;
                const d = disponible.data?.get(f.producto_id)?.disponible ?? 0;
                const r = renglonDe(f.producto_id);
                const bajoMinimo = c > 0 && f.minimo !== null && c < f.minimo;
                const titulo =
                  i === 0 || visibles[i - 1]!.rubro !== f.rubro ? f.rubro : null;
                const finalUnidad = Math.round(
                  f.precio_promo * (1 - cuenta.descuento / 100),
                );
                return (
                  <Fragment key={f.producto_id}>
                    {titulo ? (
                      <Table.Tr>
                        <Table.Td colSpan={10} bg="ciruela.0">
                          <Text
                            size="xs"
                            fw={800}
                            c="ciruela.8"
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
                        background: c > 0 ? 'var(--mantine-color-violeta-0)' : undefined,
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
                            <Badge variant="light" color="violeta" size="sm">
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
                      <Table.Td ta="right" ff="monospace" c="dimmed">
                        {pesos(f.precio_lista)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" c="dimmed">
                        {f.precio_lista
                          ? pct((f.precio_lista - f.precio_promo) / f.precio_lista)
                          : ''}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={600} c="red.8">
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
                            c={manual.has(f.producto_id) ? 'violeta.8' : 'inherit'}
                          >
                            {manual.has(f.producto_id)
                              ? `${pesos(manual.get(f.producto_id)! / f.unidades_pack)} a mano`
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
              <Text fz={20} fw={700} ff="monospace" c="rosa.7">
                {numero(cuenta.descuento)} %
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                Total con descuento
              </Text>
              <Text
                fz={26}
                fw={800}
                ff="monospace"
                c="ciruela.8"
                key={cuenta.total}
                className="monto-vivo"
              >
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
        title="Enviar el pedido"
        centered
        size="lg"
      >
        <Stack gap="sm">
          <Text size="sm">
            Decidí cuánto se arma de Calle 5 para este cliente (se sugiere lo disponible):
            eso queda reservado para él. Lo que falta va a Producción. El sistema no
            reparte entre clientes.
          </Text>
          <Table fz="sm" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">Pedido</Table.Th>
                <Table.Th ta="right">De Calle 5</Table.Th>
                <Table.Th ta="right">A producir</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pedidos.map(({ f, c, pid }) => {
                const d = disponible.data?.get(pid)?.disponible ?? 0;
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
                        aria-label={`De Calle 5 de ${f?.producto ?? ''}`}
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
              leftSection={<IconSend size={18} />}
              loading={guardar.isPending || enviar.isPending}
              onClick={() =>
                void (async () => {
                  const pid = await guardarBorrador();
                  await enviar.mutateAsync({
                    id: pid,
                    deCalle5: pedidos.map(({ c, pid: p }) => {
                      const tope = Math.min(c, disponible.data?.get(p)?.disponible ?? 0);
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
              Enviar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
