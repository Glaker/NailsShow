import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMinus,
  IconPlus,
  IconCalendarPlus,
  IconDots,
} from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaISO } from '@/lib/formato';
import {
  usePedidos,
  usePlanificarPedido,
  type PedidoRow,
} from '@/lib/consultasComercial';

/* ---------------------------- fechas ISO (día) ---------------------------- */

const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const iso = (d: Date) => fechaISO(d)!;
const sumarDias = (dia: string, n: number) => {
  const d = aFecha(dia);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const diasEntre = (a: string, b: string) =>
  Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);
const lunesDe = (dia: string) => {
  const d = aFecha(dia);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return iso(d);
};
const DIAS_SEMANA = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

/** Pedidos que Producción tiene por delante: enviados o en producción. */
const abiertos = (pedidos: PedidoRow[]) =>
  pedidos.filter(
    (p) =>
      p.eliminado_en === null &&
      !p.es_venta &&
      (p.estado === 'CONFIRMADO' || p.estado === 'EN_PRODUCCION'),
  );

/** Último día planificado de producción (inclusive). */
const finPlan = (p: PedidoRow) =>
  p.plan_inicio && p.plan_dias ? sumarDias(p.plan_inicio, p.plan_dias - 1) : null;

const colorPedido = (p: PedidoRow) =>
  p.tercero_id
    ? 'grape'
    : p.para_stock
      ? 'indigo'
      : p.estado === 'EN_PRODUCCION'
        ? 'violeta'
        : 'rosa';

/* --------------------------------- Gantt --------------------------------- */

/**
 * Diagrama de Gantt: una fila por pedido planificado, una columna por día. Se
 * mueve el bloque con las flechas y se estira o recorta con − y +. La línea
 * roja es la fecha de entrega comprometida: un bloque que la pasa, avisa.
 */
export function Gantt({
  pedidos,
  desde,
  dias,
  editable,
}: {
  pedidos: PedidoRow[];
  desde: string;
  dias: number;
  editable: boolean;
}) {
  const planificar = usePlanificarPedido();
  const [hoy] = useState(() => iso(new Date()));
  const filas = pedidos
    .filter((p) => p.plan_inicio && p.plan_dias)
    .filter(
      (p) =>
        diasEntre(desde, finPlan(p)!) >= 0 && diasEntre(desde, p.plan_inicio!) < dias,
    )
    .sort((a, b) => a.plan_inicio!.localeCompare(b.plan_inicio!));
  const columnas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
  const plantilla = `minmax(170px, 1.4fr) repeat(${dias}, minmax(26px, 1fr))`;

  const mover = (p: PedidoRow, inicio: number, largo: number) =>
    planificar.mutate({
      id: p.id,
      inicio: sumarDias(p.plan_inicio!, inicio),
      dias: Math.max(1, Math.min(60, p.plan_dias! + largo)),
    });

  if (filas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay producción planificada en estas fechas.
      </Text>
    );
  }

  return (
    <Box style={{ overflowX: 'auto' }}>
      <Box style={{ minWidth: 170 + dias * 28 }}>
        <Box style={{ display: 'grid', gridTemplateColumns: plantilla }}>
          <Box />
          {columnas.map((d) => (
            <Box
              key={d}
              ta="center"
              py={4}
              style={{
                fontSize: 11,
                borderLeft: '1px solid var(--superficie-borde)',
                background: d === hoy ? 'var(--mantine-color-violeta-1)' : undefined,
                fontWeight: d === hoy ? 700 : 400,
              }}
            >
              {DIAS_SEMANA[(aFecha(d).getDay() + 6) % 7]}
              <br />
              {aFecha(d).getDate()}
            </Box>
          ))}
        </Box>
        {filas.map((p, n) => {
          const ini = Math.max(diasEntre(desde, p.plan_inicio!), 0);
          const fin = Math.min(diasEntre(desde, finPlan(p)!), dias - 1);
          const entrega = p.fecha_entrega ? diasEntre(desde, p.fecha_entrega) : null;
          const tarde = p.fecha_entrega !== null && finPlan(p)! > p.fecha_entrega;
          return (
            <Box
              key={p.id}
              style={{ display: 'grid', gridTemplateColumns: plantilla, minHeight: 44 }}
            >
              <Box
                py={6}
                pr="xs"
                style={{
                  gridRow: 1,
                  gridColumn: 1,
                  borderTop: '1px solid var(--superficie-borde)',
                }}
              >
                <Anchor component={Link} to={`/pedidos/${p.id}`} size="sm" fw={600}>
                  {p.numero}
                </Anchor>
                <Text size="xs" c="dimmed" truncate>
                  {p.cliente}
                  {tarde ? ' · termina después de la entrega' : ''}
                </Text>
              </Box>
              {columnas.map((d, i) => (
                <Box
                  key={d}
                  style={{
                    gridRow: 1,
                    gridColumn: i + 2,
                    borderTop: '1px solid var(--superficie-borde)',
                    borderLeft:
                      entrega === i
                        ? '3px solid var(--mantine-color-red-6)'
                        : '1px solid var(--superficie-borde)',
                    position: 'relative',
                  }}
                />
              ))}
              <Box
                className="gantt-barra"
                style={
                  {
                    '--i': n,
                    gridColumn: `${ini + 2} / ${fin + 3}`,
                    gridRow: 1,
                    alignSelf: 'center',
                    height: 30,
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 6,
                    padding: '0 2px',
                    background: `var(--mantine-color-${colorPedido(p)}-${tarde ? 7 : 5})`,
                    color: '#fff',
                  }
                }
              >
                {editable && fin - ini < 3 ? (
                  /* Bloque corto: los cuatro botones (≈88 px) no entran en uno a
                     tres días de 26–40 px y quedaban blancos sobre la grilla. */
                  <AccionesCortas p={p} mover={mover} />
                ) : editable ? (
                  <>
                    <Group gap={0} wrap="nowrap">
                      <Tooltip label="Un día antes">
                        <ActionIcon
                          size="sm"
                          variant="transparent"
                          c="#fff"
                          onClick={() => mover(p, -1, 0)}
                        >
                          <IconChevronLeft size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Un día menos">
                        <ActionIcon
                          size="sm"
                          variant="transparent"
                          c="#fff"
                          onClick={() => mover(p, 0, -1)}
                        >
                          <IconMinus size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                    <Text size="xs" fw={700} truncate>
                      {p.plan_dias} d
                    </Text>
                    <Group gap={0} wrap="nowrap">
                      <Tooltip label="Un día más">
                        <ActionIcon
                          size="sm"
                          variant="transparent"
                          c="#fff"
                          onClick={() => mover(p, 0, 1)}
                        >
                          <IconPlus size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Un día después">
                        <ActionIcon
                          size="sm"
                          variant="transparent"
                          c="#fff"
                          onClick={() => mover(p, 1, 0)}
                        >
                          <IconChevronRight size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </>
                ) : (
                  <Text size="xs" fw={700} px={4} truncate>
                    {p.plan_dias} d
                  </Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Las mismas cuatro acciones del bloque, en un menú, para bloques cortos. */
function AccionesCortas({
  p,
  mover,
}: {
  p: PedidoRow;
  mover: (p: PedidoRow, inicio: number, largo: number) => void;
}) {
  return (
    <Menu position="bottom" withArrow shadow="md">
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="transparent"
          c="#fff"
          mx="auto"
          aria-label={`Mover o estirar ${p.numero}`}
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {p.numero} · {p.plan_dias} {p.plan_dias === 1 ? 'día' : 'días'}
        </Menu.Label>
        <Menu.Item
          leftSection={<IconChevronLeft size={16} />}
          onClick={() => mover(p, -1, 0)}
        >
          Un día antes
        </Menu.Item>
        <Menu.Item
          leftSection={<IconChevronRight size={16} />}
          onClick={() => mover(p, 1, 0)}
        >
          Un día después
        </Menu.Item>
        <Menu.Item leftSection={<IconPlus size={16} />} onClick={() => mover(p, 0, 1)}>
          Un día más
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMinus size={16} />}
          disabled={p.plan_dias === 1}
          onClick={() => mover(p, 0, -1)}
        >
          Un día menos
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/* ------------------------------- Calendario ------------------------------ */

/**
 * Mes con las entregas comprometidas y los días de producción de cada pedido.
 * Grilla de calendario de verdad: una sola hoja con líneas, el número en la
 * esquina, hoy en un círculo y el fin de semana apenas teñido.
 */
export function CalendarioMes({ pedidos, mes }: { pedidos: PedidoRow[]; mes: string }) {
  const primero = `${mes.slice(0, 7)}-01`;
  const desde = lunesDe(primero);
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(desde, i));
  const [hoy] = useState(() => iso(new Date()));
  return (
    <div className="calendario" key={mes}>
      {DIAS_SEMANA.map((d) => (
        <div key={d} className="calendario-dia-semana">
          {d}
        </div>
      ))}
      {dias.map((d, i) => {
        const entregas = pedidos.filter((p) => p.fecha_entrega === d);
        const produce = pedidos.filter(
          (p) => p.plan_inicio && d >= p.plan_inicio && d <= finPlan(p)!,
        );
        const dow = (aFecha(d).getDay() + 6) % 7;
        return (
          <div
            key={d}
            className="calendario-celda"
            data-fuera={d.slice(0, 7) !== mes.slice(0, 7)}
            data-finde={dow >= 5}
            data-hoy={d === hoy}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="calendario-numero">{aFecha(d).getDate()}</span>
            {produce.map((p) => (
              <Tooltip key={`p${p.id}`} label={`Produce ${p.numero} · ${p.cliente}`}>
                <Link
                  to={`/pedidos/${p.id}`}
                  className="calendario-evento"
                  style={{
                    background: `var(--mantine-color-${colorPedido(p)}-1)`,
                    color: `var(--mantine-color-${colorPedido(p)}-9)`,
                    borderLeftColor: `var(--mantine-color-${colorPedido(p)}-6)`,
                  }}
                >
                  {p.numero}
                </Link>
              </Tooltip>
            ))}
            {entregas.map((p) => (
              <Tooltip key={`e${p.id}`} label={`Entrega ${p.numero} · ${p.cliente}`}>
                <Link
                  to={`/pedidos/${p.id}`}
                  className="calendario-evento calendario-entrega"
                >
                  ● {p.numero}
                </Link>
              </Tooltip>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Título del mes con flechas, para recorrer el calendario sin editar nada. */
function MesNavegable({ pedidos }: { pedidos: PedidoRow[] }) {
  const [hoy] = useState(() => iso(new Date()));
  const [mes, setMes] = useState(() => hoy.slice(0, 7));
  const correr = (n: number) => {
    const d = aFecha(`${mes}-01`);
    d.setMonth(d.getMonth() + n);
    setMes(iso(d).slice(0, 7));
  };
  return (
    <>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={3} tt="capitalize">
          {aFecha(`${mes}-01`).toLocaleDateString('es-AR', {
            month: 'long',
            year: 'numeric',
          })}
        </Title>
        <Group gap={6} wrap="nowrap">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => correr(-1)}
            aria-label="Mes anterior"
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Button variant="default" onClick={() => setMes(hoy.slice(0, 7))}>
            Hoy
          </Button>
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => correr(1)}
            aria-label="Mes siguiente"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
      </Group>
      <CalendarioMes pedidos={pedidos} mes={`${mes}-01`} />
    </>
  );
}

/* --------------------------- Planificar un pedido ------------------------- */

function ModalPlanificar({
  pedido,
  onCerrar,
}: {
  pedido: PedidoRow | null;
  onCerrar: () => void;
}) {
  const planificar = usePlanificarPedido();
  const [inicio, setInicio] = useState<Date | null>(null);
  const [dias, setDias] = useState<number | string>(1);
  const inicial = pedido?.plan_inicio ? aFecha(pedido.plan_inicio) : new Date();
  const valorInicio = inicio ?? inicial;
  const n = typeof dias === 'number' ? dias : Number(dias || 0);
  return (
    <Modal
      opened={pedido !== null}
      onClose={onCerrar}
      title={pedido ? `Planificar ${pedido.numero} · ${pedido.cliente}` : ''}
      centered
    >
      {pedido ? (
        <Stack gap="md">
          {pedido.fecha_entrega ? (
            <Text size="sm">
              Entrega comprometida: <b>{fecha(pedido.fecha_entrega)}</b>
            </Text>
          ) : null}
          <DateInput
            label="Empieza a producirse"
            valueFormat="DD/MM/YYYY"
            value={valorInicio}
            onChange={(v) => setInicio(v ? new Date(v) : null)}
          />
          <NumberInput
            label="Días de producción"
            min={1}
            max={60}
            allowDecimal={false}
            value={
              pedido.plan_dias && inicio === null && dias === 1 ? pedido.plan_dias : dias
            }
            onChange={setDias}
          />
          <Group justify="space-between">
            {pedido.plan_inicio ? (
              <Button
                variant="subtle"
                color="gray"
                onClick={() =>
                  planificar.mutate(
                    { id: pedido.id, inicio: null, dias: null },
                    { onSuccess: onCerrar },
                  )
                }
              >
                Sacar del plan
              </Button>
            ) : (
              <span />
            )}
            <Button
              loading={planificar.isPending}
              disabled={n < 1 || n > 60}
              onClick={() =>
                planificar.mutate(
                  {
                    id: pedido.id,
                    inicio: iso(valorInicio),
                    dias:
                      pedido.plan_dias && inicio === null && dias === 1
                        ? pedido.plan_dias
                        : n,
                  },
                  { onSuccess: onCerrar },
                )
              }
            >
              Guardar
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

function SinPlanificar({
  pedidos,
  editable,
  onPlanificar,
}: {
  pedidos: PedidoRow[];
  editable: boolean;
  onPlanificar: (p: PedidoRow) => void;
}) {
  const sin = pedidos
    .filter((p) => !p.plan_inicio)
    .sort((a, b) => (a.fecha_entrega ?? '9999').localeCompare(b.fecha_entrega ?? '9999'));
  if (sin.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text fw={600}>Sin planificar ({sin.length})</Text>
      {sin.map((p) => (
        <Group key={p.id} justify="space-between" wrap="nowrap">
          <Text size="sm">
            <Anchor component={Link} to={`/pedidos/${p.id}`} fw={600}>
              {p.numero}
            </Anchor>{' '}
            · {p.cliente} · entrega {fecha(p.fecha_entrega)}
          </Text>
          {editable ? (
            <Button
              size="compact-md"
              variant="light"
              leftSection={<IconCalendarPlus size={16} />}
              onClick={() => onPlanificar(p)}
            >
              Planificar
            </Button>
          ) : null}
        </Group>
      ))}
    </Stack>
  );
}

/* ------------------------------ Planificación ----------------------------- */

/**
 * Planificación (ítem 11 de la cola del 24/09): calendario de pedidos donde
 * Nazarena elige el día de producción y cuántos días se extiende, y un Gantt
 * con lo que se produce en paralelo para estirar o recortar.
 */
export function PaginaPlanificacion() {
  const pedidos = usePedidos();
  const editable = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const [hoy] = useState(() => iso(new Date()));
  const [desde, setDesde] = useState(() => lunesDe(iso(new Date())));
  const [vista, setVista] = useState<'gantt' | 'mes'>('gantt');
  const [planificando, setPlanificando] = useState<PedidoRow | null>(null);
  const lista = abiertos(pedidos.data ?? []);

  return (
    <>
      <EncabezadoPagina
        titulo="Planificación"
        descripcion="Qué se produce cada día y cuánto dura. La línea roja es la entrega comprometida."
        acciones={
          <Group gap="sm">
            <SegmentedControl
              value={vista}
              onChange={(v) => setVista(v as 'gantt' | 'mes')}
              data={[
                { value: 'gantt', label: 'Gantt' },
                { value: 'mes', label: 'Calendario' },
              ]}
            />
            <ActionIcon
              size="lg"
              variant="default"
              onClick={() => setDesde(sumarDias(desde, vista === 'mes' ? -28 : -7))}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Button variant="default" onClick={() => setDesde(lunesDe(hoy))}>
              Hoy
            </Button>
            <ActionIcon
              size="lg"
              variant="default"
              onClick={() => setDesde(sumarDias(desde, vista === 'mes' ? 28 : 7))}
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        }
      />
      {pedidos.isLoading ? (
        <Skeleton h={300} />
      ) : (
        <Stack gap="lg">
          <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
            {vista === 'gantt' ? (
              <Gantt pedidos={lista} desde={desde} dias={21} editable={editable} />
            ) : (
              <>
                <Title order={4} mb="sm" tt="capitalize">
                  {aFecha(sumarDias(desde, 7)).toLocaleDateString('es-AR', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Title>
                <CalendarioMes pedidos={lista} mes={sumarDias(desde, 7)} />
              </>
            )}
          </Paper>
          <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
            <SinPlanificar
              pedidos={lista}
              editable={editable}
              onPlanificar={setPlanificando}
            />
            {editable ? (
              <Text size="xs" c="dimmed" mt="sm">
                Para cambiar un pedido ya planificado, usá las flechas y los botones del
                bloque, o{' '}
                {lista
                  .filter((p) => p.plan_inicio)
                  .slice(0, 8)
                  .map((p) => (
                    <Anchor
                      key={p.id}
                      size="xs"
                      onClick={() => setPlanificando(p)}
                      mr={6}
                    >
                      {p.numero}
                    </Anchor>
                  ))}
              </Text>
            ) : null}
          </Paper>
        </Stack>
      )}
      <ModalPlanificar pedido={planificando} onCerrar={() => setPlanificando(null)} />
    </>
  );
}

/* ------------------------------ Inicio de pedidos ------------------------ */

function Contador({
  valor,
  etiqueta,
  color,
  i,
}: {
  valor: number;
  etiqueta: string;
  color: string;
  i: number;
}) {
  return (
    <Paper
      withBorder
      p="md"
      radius="lg"
      className="contador"
      style={{ borderColor: 'var(--superficie-borde)', '--i': i }}
    >
      <Text fz={34} fw={800} lh={1} c={`${color}.7`}>
        {valor}
      </Text>
      <Text size="sm" c="dimmed" mt={6}>
        {etiqueta}
      </Text>
    </Paper>
  );
}

/**
 * Inicio de Nazarena y de Ventas (pedido del 2026-10-01): saludo, resumen de
 * pedidos, el Gantt de las próximas dos semanas y un calendario de verdad.
 * Solo se mira: para mover algo se va a Planificación.
 */
export function InicioPedidos({ descripcion }: { descripcion?: string }) {
  const { claims } = useSesion();
  const pedidos = usePedidos();
  const [ahora] = useState(() => new Date());
  const lista = abiertos(pedidos.data ?? []).sort((a, b) =>
    (a.fecha_entrega ?? '9999').localeCompare(b.fecha_entrega ?? '9999'),
  );
  const hora = ahora.getHours();
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = claims?.nombre?.split(' ')[0] ?? '';
  const hoy = iso(ahora);
  const vencidos = lista.filter((p) => p.fecha_entrega && p.fecha_entrega < hoy);
  const enProduccion = lista.filter((p) => p.estado === 'EN_PRODUCCION');
  const sinPlan = lista.filter((p) => !p.plan_inicio);

  if (pedidos.isLoading) return <Skeleton h={420} radius="lg" />;
  return (
    <Stack gap="lg">
      <div className="saludo">
        <Title order={1}>
          {saludo}
          {nombre ? `, ${nombre}` : ''}
        </Title>
        <Text c="dimmed" size="lg">
          {descripcion ??
            (lista.length === 0
              ? 'No hay pedidos pendientes.'
              : `Tenés ${lista.length} pedidos por delante.`)}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Contador
          i={0}
          valor={lista.length}
          etiqueta="Pedidos pendientes"
          color="violeta"
        />
        <Contador
          i={1}
          valor={enProduccion.length}
          etiqueta="En producción"
          color="ciruela"
        />
        <Contador i={2} valor={sinPlan.length} etiqueta="Sin planificar" color="gray" />
        <Contador
          i={3}
          valor={vencidos.length}
          etiqueta="Con la entrega vencida"
          color={vencidos.length ? 'red' : 'gray'}
        />
      </SimpleGrid>

      <Paper
        withBorder
        p="lg"
        radius="lg"
        className="entrada"
        style={{ borderColor: 'var(--superficie-borde)' }}
      >
        <Title order={3} mb="sm">
          Resumen de pedidos
        </Title>
        {lista.length === 0 ? (
          <Text c="dimmed">No hay pedidos pendientes.</Text>
        ) : (
          <Stack gap={0}>
            {lista.slice(0, 10).map((p, i) => {
              const tarde = p.fecha_entrega !== null && p.fecha_entrega < hoy;
              return (
                <Group
                  key={p.id}
                  justify="space-between"
                  wrap="nowrap"
                  className="fila-resumen"
                  style={{ '--i': i }}
                >
                  <Text size="sm" truncate>
                    <Anchor component={Link} to={`/pedidos/${p.id}`} fw={700}>
                      {p.numero}
                    </Anchor>{' '}
                    · {p.cliente}
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    {p.plan_inicio ? (
                      <Badge variant="light" color="violeta">
                        produce {fecha(p.plan_inicio).slice(0, 5)}
                      </Badge>
                    ) : (
                      <Badge variant="light" color="gray">
                        sin planificar
                      </Badge>
                    )}
                    <Badge
                      variant={tarde ? 'filled' : 'light'}
                      color={tarde ? 'red' : 'rosa'}
                    >
                      entrega {p.fecha_entrega ? fecha(p.fecha_entrega).slice(0, 5) : '—'}
                    </Badge>
                  </Group>
                </Group>
              );
            })}
            {lista.length > 10 ? (
              <Text size="sm" c="dimmed" mt="xs">
                y {lista.length - 10} más
              </Text>
            ) : null}
          </Stack>
        )}
      </Paper>

      <Paper
        withBorder
        p="lg"
        radius="lg"
        className="entrada"
        style={{ borderColor: 'var(--superficie-borde)' }}
      >
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Title order={3}>Próximas dos semanas</Title>
          <Text size="xs" c="dimmed">
            Para mover o estirar algo, andá a{' '}
            <Anchor component={Link} to="/planificacion" size="xs">
              Planificación
            </Anchor>
            .
          </Text>
        </Group>
        <Gantt pedidos={lista} desde={lunesDe(hoy)} dias={14} editable={false} />
      </Paper>

      <Paper
        withBorder
        p="lg"
        radius="lg"
        className="entrada"
        style={{ borderColor: 'var(--superficie-borde)' }}
      >
        <MesNavegable pedidos={lista} />
      </Paper>
    </Stack>
  );
}
