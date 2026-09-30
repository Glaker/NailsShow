import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import { IconArrowDownRight, IconArrowUpRight, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { dineroCompacto, numero } from '@/lib/formato';
import {
  useDetalleDia,
  useFlujoDiario,
  type CuentaDia,
  type DiaFlujo,
  type MovimientoDia,
} from '@/lib/consultasFlujo';
import './graficos.css';

/* Geometría. */
const ALTO = 300;
const ALTO_ABIERTO = 580;
const M = { arriba: 18, abajo: 30, izquierda: 10, derecha: 58 };
const PASO_MIN = 24;
const EASING = 'cubic-bezier(0.2, 0.9, 0.1, 1)';

const LINEAS = [
  { clave: 'saldo_bancos', nombre: 'Bancos', color: 'var(--mantine-color-violeta-6)' },
  { clave: 'saldo_efectivo', nombre: 'Efectivo', color: 'var(--mantine-color-orange-6)' },
] as const;
type ClaveLinea = (typeof LINEAS)[number]['clave'];

const VERDE = 'var(--mantine-color-estadoAprobado-6)';
const ROJO = 'var(--mantine-color-estadoRechazado-6)';

const reducido = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const diaCorto = (f: string) => dayjs(f).format('DD/MM');
const diaLargo = (f: string) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
const conSigno = (n: number) => (n > 0 ? `+${dineroCompacto(n)}` : dineroCompacto(n));

type Tooltip = { x: number; y: number; lineas: string[]; titulo: string };
type Abierto = {
  tipo: 'dia' | 'cuentas';
  fecha: string;
  signo: 'pos' | 'neg' | 'linea';
  origen: { x: number; y: number; w: number; h: number };
};

/** Curva que pasa por todos los puntos (Catmull-Rom → Bézier), como GraficoArea. */
function curva(puntos: { x: number; y: number }[]) {
  if (puntos.length === 0) return '';
  let d = `M ${puntos[0]!.x} ${puntos[0]!.y}`;
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i]!;
    const p1 = puntos[i]!;
    const p2 = puntos[i + 1]!;
    const p3 = puntos[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Flujo de caja día a día (pedido de Administración, 2026-09-30).
 *
 * Barras: el resultado del día (entró − salió), verde para arriba si es
 * positivo, rojo para abajo si es negativo, en proporción. Líneas: saldo de
 * bancos y de efectivo al cierre de cada día, en su propia escala (eje de la
 * derecha): la caja es mucho más grande que el movimiento de un día y en la
 * misma escala las barras no se verían. Todas las cuentas como una sola (Nail
 * Show, Athene del Plata y Virginia Arleo).
 *
 * Tocar una barra abre el día: de dónde vino y adónde fue cada peso. Tocar una
 * línea abre las cuentas de ese día: dónde está la plata. El panel sale desde
 * lo que se tocó (clip-path animado) y el marco crece para dejarle lugar.
 */
export function GraficoFlujo() {
  const [dias, setDias] = useState('30');
  const hasta = dayjs().format('YYYY-MM-DD');
  const desde = dayjs()
    .subtract(Number(dias) - 1, 'day')
    .format('YYYY-MM-DD');
  const flujo = useFlujoDiario(desde, hasta);

  return (
    <Paper
      withBorder
      p="md"
      radius="lg"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Group justify="space-between" mb="xs" wrap="wrap" gap="sm">
        <div>
          <Text fw={700}>Flujo de caja</Text>
          <Text size="xs" c="dimmed">
            Nail Show, Athene del Plata y Virginia Arleo como una sola caja. Tocá una
            barra o una línea para ver el detalle.
          </Text>
        </div>
        <SegmentedControl
          value={dias}
          onChange={setDias}
          data={[
            { value: '30', label: '30 días' },
            { value: '60', label: '60 días' },
            { value: '90', label: '90 días' },
          ]}
        />
      </Group>
      <Group gap="md" mb={6}>
        <Leyenda color={VERDE} texto="Entró más de lo que salió" forma="barra" />
        <Leyenda color={ROJO} texto="Salió más de lo que entró" forma="barra" />
        {LINEAS.map((l) => (
          <Leyenda key={l.clave} color={l.color} texto={l.nombre} forma="linea" />
        ))}
      </Group>
      {flujo.isLoading ? (
        <Skeleton h={ALTO} radius="md" />
      ) : flujo.isError ? (
        <Text size="sm" c="estadoRechazado.7" py="xl" ta="center">
          No se pudo leer el flujo de caja: {flujo.error.message}
        </Text>
      ) : (
        <Lienzo datos={flujo.data ?? []} />
      )}
    </Paper>
  );
}

function Leyenda({
  color,
  texto,
  forma,
}: {
  color: string;
  texto: string;
  forma: 'barra' | 'linea';
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <span
        style={{
          width: forma === 'barra' ? 10 : 16,
          height: forma === 'barra' ? 10 : 3,
          borderRadius: 3,
          background: color,
        }}
      />
      <Text size="xs" c="dimmed">
        {texto}
      </Text>
    </Group>
  );
}

function Lienzo({ datos }: { datos: DiaFlujo[] }) {
  const { ref: medida, width: anchoVisible } = useElementSize();
  const marco = useRef<HTMLDivElement>(null);
  const refMarco = useMergedRef(marco, medida);
  const scroll = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [barraActiva, setBarraActiva] = useState<number | null>(null);
  const [lineaActiva, setLineaActiva] = useState<{ clave: ClaveLinea; i: number } | null>(
    null,
  );
  const [abierto, setAbierto] = useState<Abierto | null>(null);

  const g = useMemo(() => {
    const n = datos.length;
    const util = Math.max(anchoVisible - M.izquierda - M.derecha, 0);
    const paso = Math.max(PASO_MIN, n ? util / n : PASO_MIN);
    const ancho = M.izquierda + M.derecha + paso * n;
    const alto = ALTO - M.arriba - M.abajo;

    // Barras: cero donde corresponde según lo más alto y lo más bajo.
    const maxPos = Math.max(0, ...datos.map((d) => d.neto));
    const maxNeg = Math.max(0, ...datos.map((d) => -d.neto));
    const rango = maxPos + maxNeg || 1;
    const cero = M.arriba + (maxPos || maxNeg ? (maxPos / rango) * alto : alto / 2);
    const barra = Math.min(paso * 0.62, 26);

    // Líneas: escala propia, con un poco de aire arriba y abajo.
    const saldos = datos.flatMap((d) => [d.saldo_bancos, d.saldo_efectivo]);
    const sMin = Math.min(0, ...saldos);
    const sMax = Math.max(1, ...saldos);
    const pad = (sMax - sMin) * 0.08;
    const yS = (v: number) =>
      M.arriba + alto - ((v - (sMin - pad)) / (sMax - sMin + 2 * pad)) * alto;

    const x = (i: number) => M.izquierda + paso * i + paso / 2;
    const cadaCuanto = Math.max(1, Math.ceil(48 / paso));

    return {
      paso,
      ancho,
      alto,
      cero,
      barra,
      x,
      cadaCuanto,
      yS,
      altoBarra: (v: number) => (Math.abs(v) / rango) * alto,
      ticks: [sMin, (sMin + sMax) / 2, sMax],
      lineas: LINEAS.map((l) => ({
        ...l,
        puntos: datos.map((d, i) => ({ x: x(i), y: yS(d[l.clave]) })),
      })),
    };
  }, [datos, anchoVisible]);

  // Lo más reciente a la vista: el scroll arranca a la derecha.
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth;
  }, [g.ancho]);

  const posEnMarco = (el: Element) => {
    const r = el.getBoundingClientRect();
    const m = marco.current!.getBoundingClientRect();
    return { x: r.left - m.left, y: r.top - m.top, w: r.width, h: r.height };
  };

  const indiceEn = (clientX: number, svg: SVGSVGElement) => {
    const x = clientX - svg.getBoundingClientRect().left;
    return Math.min(
      datos.length - 1,
      Math.max(0, Math.floor((x - M.izquierda) / g.paso)),
    );
  };

  const mostrarBarra = (i: number, el: SVGRectElement) => {
    const d = datos[i]!;
    const p = posEnMarco(el);
    setBarraActiva(i);
    setTooltip({
      x: p.x + p.w / 2,
      y: Math.min(p.y, g.cero),
      titulo: diaLargo(d.fecha),
      lineas: [
        `Entró ${dineroCompacto(d.ingresos)}`,
        `Salió ${dineroCompacto(d.egresos)}`,
        `Resultado ${conSigno(d.neto)}`,
      ],
    });
  };

  const mostrarLinea = (clave: ClaveLinea, clientX: number, svg: SVGSVGElement) => {
    const i = indiceEn(clientX, svg);
    const d = datos[i]!;
    const l = LINEAS.find((x) => x.clave === clave)!;
    const m = marco.current!.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    setLineaActiva({ clave, i });
    setTooltip({
      x: s.left - m.left + g.x(i),
      y: s.top - m.top + g.yS(d[clave]),
      titulo: `${l.nombre} · ${diaLargo(d.fecha)}`,
      lineas: [
        `En cuenta ${dineroCompacto(d[clave])}`,
        `Bancos + efectivo ${dineroCompacto(d.saldo_bancos + d.saldo_efectivo)}`,
      ],
    });
  };

  const limpiar = () => {
    setTooltip(null);
    setBarraActiva(null);
    setLineaActiva(null);
  };

  if (datos.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="xl" ta="center">
        Sin movimientos en el período.
      </Text>
    );
  }

  return (
    <div
      ref={refMarco}
      className="gf-marco"
      style={{ height: abierto ? ALTO_ABIERTO : ALTO }}
    >
      <div ref={scroll} className="gf-scroll">
        <svg
          className="gf-svg"
          data-foco={barraActiva !== null ? 'barra' : undefined}
          width={g.ancho}
          height={ALTO}
          role="img"
          aria-label="Flujo de caja día a día"
          onMouseLeave={limpiar}
        >
          {/* Eje de saldos, a la derecha. */}
          {g.ticks.map((t, k) => (
            <g key={k}>
              <line
                x1={M.izquierda}
                x2={g.ancho - M.derecha}
                y1={g.yS(t)}
                y2={g.yS(t)}
                stroke="var(--mantine-color-default-border)"
                strokeOpacity={0.5}
              />
              <text
                x={g.ancho - M.derecha + 6}
                y={g.yS(t)}
                dominantBaseline="middle"
                style={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
              >
                {dineroCompacto(t)}
              </text>
            </g>
          ))}
          <line
            x1={M.izquierda}
            x2={g.ancho - M.derecha}
            y1={g.cero}
            y2={g.cero}
            stroke="var(--mantine-color-dimmed)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />

          {datos.map((d, i) => {
            const h = Math.max(g.altoBarra(d.neto), d.neto === 0 ? 0 : 2);
            const pos = d.neto >= 0;
            return (
              <g key={d.fecha}>
                {i % g.cadaCuanto === 0 ? (
                  <text
                    x={g.x(i)}
                    y={ALTO - 10}
                    textAnchor="middle"
                    style={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
                  >
                    {diaCorto(d.fecha)}
                  </text>
                ) : null}
                {/* Zona de toque de todo el alto del día: una barra chica también se toca. */}
                <rect
                  x={g.x(i) - g.paso / 2}
                  y={M.arriba}
                  width={g.paso}
                  height={g.alto}
                  fill="transparent"
                  onMouseEnter={(e) =>
                    mostrarBarra(i, e.currentTarget.nextElementSibling as SVGRectElement)
                  }
                  onClick={(e) =>
                    abrirDia(i, e.currentTarget.nextElementSibling as SVGRectElement)
                  }
                  style={{ cursor: 'pointer' }}
                />
                <rect
                  className="gf-barra"
                  data-signo={pos ? 'pos' : 'neg'}
                  data-activa={barraActiva === i}
                  tabIndex={0}
                  role="button"
                  aria-label={`${diaLargo(d.fecha)}: resultado ${conSigno(d.neto)}`}
                  x={g.x(i) - g.barra / 2}
                  y={pos ? g.cero - h : g.cero}
                  width={g.barra}
                  height={h}
                  rx={Math.min(6, g.barra / 3)}
                  fill={pos ? VERDE : ROJO}
                  style={{ '--retraso': `${Math.min(i * 14, 420)}ms` } as CSSProperties}
                  onMouseEnter={(e) => mostrarBarra(i, e.currentTarget)}
                  onFocus={(e) => mostrarBarra(i, e.currentTarget)}
                  onBlur={limpiar}
                  onClick={(e) => abrirDia(i, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') abrirDia(i, e.currentTarget);
                  }}
                />
              </g>
            );
          })}

          {g.lineas.map((l) => (
            <g
              key={l.clave}
              className="gf-linea-grupo"
              data-activa={lineaActiva?.clave === l.clave}
            >
              <path
                className="gf-linea"
                d={curva(l.puntos)}
                stroke={l.color}
                pathLength={1}
              />
              <path
                className="gf-linea-toque"
                d={curva(l.puntos)}
                onMouseMove={(e) =>
                  mostrarLinea(l.clave, e.clientX, e.currentTarget.ownerSVGElement!)
                }
                onClick={(e) =>
                  abrirCuentas(l.clave, e.clientX, e.currentTarget.ownerSVGElement!)
                }
              />
              {lineaActiva?.clave === l.clave ? (
                <circle
                  className="gf-punto"
                  cx={l.puntos[lineaActiva.i]!.x}
                  cy={l.puntos[lineaActiva.i]!.y}
                  r={5}
                  fill={l.color}
                  stroke="var(--mantine-color-body)"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      {tooltip && !abierto ? (
        <div
          key={`${tooltip.x}-${tooltip.y}`}
          className="gf-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2, textTransform: 'capitalize' }}>
            {tooltip.titulo}
          </div>
          {tooltip.lineas.map((t) => (
            <div key={t}>{t}</div>
          ))}
        </div>
      ) : null}

      {abierto ? (
        <Panel
          abierto={abierto}
          alCerrar={() => setAbierto(null)}
          dia={datos.find((d) => d.fecha === abierto.fecha)!}
        />
      ) : null}
    </div>
  );

  function abrirDia(i: number, el: SVGRectElement) {
    const d = datos[i]!;
    setTooltip(null);
    setAbierto({
      tipo: 'dia',
      fecha: d.fecha,
      signo: d.neto >= 0 ? 'pos' : 'neg',
      origen: posEnMarco(el),
    });
  }

  function abrirCuentas(clave: ClaveLinea, clientX: number, svg: SVGSVGElement) {
    const i = indiceEn(clientX, svg);
    const m = marco.current!.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    const cx = s.left - m.left + g.x(i);
    const cy = s.top - m.top + g.yS(datos[i]![clave]);
    setTooltip(null);
    setAbierto({
      tipo: 'cuentas',
      fecha: datos[i]!.fecha,
      signo: 'linea',
      origen: { x: cx - 10, y: cy - 10, w: 20, h: 20 },
    });
  }
}

/* ------------------------------------------------------------------------- *
 * Panel de detalle
 * ------------------------------------------------------------------------- */

function Panel({
  abierto,
  alCerrar,
  dia,
}: {
  abierto: Abierto;
  alCerrar: () => void;
  dia: DiaFlujo;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const detalle = useDetalleDia(abierto.fecha);

  const recorte = () => {
    const el = ref.current!;
    const { x, y, w, h } = abierto.origen;
    const ancho = el.offsetWidth;
    return `inset(${Math.max(y, 0)}px ${Math.max(ancho - x - w, 0)}px ${Math.max(ALTO_ABIERTO - y - h, 0)}px ${Math.max(x, 0)}px round 8px)`;
  };
  const tinte =
    abierto.signo === 'pos'
      ? VERDE
      : abierto.signo === 'neg'
        ? ROJO
        : 'var(--mantine-color-violeta-6)';

  // Se abre desde lo que se tocó: el recorte parte del rectángulo de la barra.
  useLayoutEffect(() => {
    if (reducido() || !ref.current) return;
    ref.current.animate(
      [{ clipPath: recorte() }, { clipPath: 'inset(0px 0px 0px 0px round 14px)' }],
      { duration: 480, easing: EASING },
    );
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrar = () => {
    if (reducido() || !ref.current) return alCerrar();
    const a = ref.current.animate(
      [
        { clipPath: 'inset(0px 0px 0px 0px round 14px)', opacity: 1 },
        { clipPath: recorte(), opacity: 0.2 },
      ],
      { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
    );
    a.onfinish = alCerrar;
  };

  const movs = detalle.data?.movimientos ?? [];
  const ingresos = movs.filter((m) => m.tipo !== 'TRANSFERENCIA' && m.importe > 0);
  const egresos = movs.filter((m) => m.tipo !== 'TRANSFERENCIA' && m.importe < 0);
  const internos = movs.filter((m) => m.tipo === 'TRANSFERENCIA');

  return (
    <div
      ref={ref}
      className="gf-detalle"
      role="dialog"
      aria-label={`Detalle del ${diaLargo(abierto.fecha)}`}
      onKeyDown={(e) => e.key === 'Escape' && cerrar()}
    >
      {/* El color de lo tocado cubre el panel y se desvanece: la barra «se abre». */}
      {reducido() ? null : <div className="gf-tinte" style={{ background: tinte }} />}
      <Group justify="space-between" mb="md" className="gf-aparece" wrap="nowrap">
        <div>
          <Text fw={700} size="lg" style={{ textTransform: 'capitalize' }}>
            {diaLargo(abierto.fecha)}
          </Text>
          {abierto.tipo === 'dia' ? (
            <Group gap="md">
              <Text size="sm" c="estadoAprobado.7">
                Entró {dineroCompacto(dia.ingresos)}
              </Text>
              <Text size="sm" c="estadoRechazado.7">
                Salió {dineroCompacto(dia.egresos)}
              </Text>
              <Text size="sm" fw={700}>
                Resultado {conSigno(dia.neto)}
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Dónde está la plata al cierre:{' '}
              {dineroCompacto(dia.saldo_bancos + dia.saldo_efectivo)} en total
            </Text>
          )}
        </div>
        <ActionIcon
          size="xl"
          variant="light"
          radius="xl"
          onClick={cerrar}
          aria-label="Cerrar detalle"
          autoFocus
        >
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {detalle.isLoading ? (
        <Stack gap="sm">
          <Skeleton h={70} radius="md" />
          <Skeleton h={70} radius="md" />
        </Stack>
      ) : detalle.isError ? (
        <Text size="sm" c="estadoRechazado.7">
          No se pudo leer el día: {detalle.error.message}
        </Text>
      ) : abierto.tipo === 'dia' ? (
        <>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Columna
              titulo="Ingresos"
              color="estadoAprobado"
              icono={<IconArrowUpRight size={18} />}
              movimientos={ingresos}
            />
            <Columna
              titulo="Egresos"
              color="estadoRechazado"
              icono={<IconArrowDownRight size={18} />}
              movimientos={egresos}
            />
          </SimpleGrid>
          {internos.length > 0 ? (
            <Box mt="md" className="gf-aparece" style={{ '--i': 6 }}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
                Entre cuentas (no cambia la caja)
              </Text>
              {internos.map((m) => (
                <Text key={m.id} size="sm">
                  {m.cuenta}: {conSigno(m.importe)} · {m.concepto}
                </Text>
              ))}
            </Box>
          ) : null}
        </>
      ) : (
        <Cuentas cuentas={detalle.data?.cuentas ?? []} movimientos={movs} />
      )}
    </div>
  );
}

function Columna({
  titulo,
  color,
  icono,
  movimientos,
}: {
  titulo: string;
  color: string;
  icono: ReactNode;
  movimientos: MovimientoDia[];
}) {
  const total = movimientos.reduce((a, m) => a + Math.abs(m.importe), 0);
  return (
    <Stack gap="xs">
      <Group gap={6} className="gf-aparece" style={{ '--i': 1 }}>
        <Box c={`${color}.7`}>{icono}</Box>
        <Text fw={700} c={`${color}.7`}>
          {titulo} · {dineroCompacto(total)}
        </Text>
      </Group>
      {movimientos.length === 0 ? (
        <Text
          size="sm"
          c="dimmed"
          className="gf-aparece"
          style={{ '--i': 2 }}
        >
          Nada este día.
        </Text>
      ) : (
        movimientos.map((m, k) => (
          <Paper
            key={m.id}
            withBorder
            p="sm"
            radius="md"
            className="gf-aparece"
            style={
              {
                '--i': k + 2,
                borderLeft: `4px solid var(--mantine-color-${color}-6)`,
              }
            }
          >
            <Tarjeta m={m} />
          </Paper>
        ))
      )}
    </Stack>
  );
}

function Tarjeta({ m }: { m: MovimientoDia }) {
  const cabecera = (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text fw={700} truncate>
        {m.cobro?.cliente ?? m.pago?.proveedor ?? m.contraparte ?? m.concepto}
      </Text>
      <Text fw={700} ff="monospace" title={`$ ${numero(m.importe, 2)}`}>
        {conSigno(m.importe)}
      </Text>
    </Group>
  );
  const donde = (
    <Text size="xs" c="dimmed">
      {m.cuenta}
      {m.titular ? ` (${m.titular})` : ''} ·{' '}
      {(m.cobro?.medio ?? m.pago?.medio ?? m.tipo).toLowerCase()}
      {m.registrado_por ? ` · registró ${m.registrado_por}` : ''}
      {m.es_anulacion ? ' · anulación' : ''}
    </Text>
  );

  if (m.cobro) {
    return (
      <Stack gap={4}>
        {cabecera}
        {donde}
        {m.cobro.facturas.length === 0 ? (
          <Text size="xs" c="dimmed">
            Cobrado sin imputar a una factura.
          </Text>
        ) : (
          m.cobro.facturas.map((f) => (
            <Box key={f.comprobante}>
              <Text size="sm">
                Factura {f.comprobante} · a nombre de <b>{f.a_nombre_de}</b>
              </Text>
              <Text size="xs" c="dimmed">
                Pedido {f.pedido}
                {f.vendedor ? ` · vendió ${f.vendedor}` : ''} · imputado{' '}
                {dineroCompacto(f.imputado)}
              </Text>
              {f.productos.map((p) => (
                <Text key={p.producto} size="xs">
                  {numero(p.cantidad, 0)} × {p.producto} — {dineroCompacto(p.importe)}
                </Text>
              ))}
            </Box>
          ))
        )}
      </Stack>
    );
  }
  if (m.pago) {
    return (
      <Stack gap={4}>
        {cabecera}
        {donde}
        {m.pago.comprobantes.length === 0 ? (
          <Text size="xs" c="dimmed">
            Pagado a cuenta, sin imputar a un comprobante.
          </Text>
        ) : (
          m.pago.comprobantes.map((c) => (
            <Box key={c.comprobante}>
              <Text size="sm">
                {c.comprobante}
                {c.recepcion ? ` · recepción ${c.recepcion}` : ''} ·{' '}
                {dineroCompacto(c.imputado)}
              </Text>
              {c.insumos.map((i) => (
                <Text key={i.insumo} size="xs">
                  {i.cantidad !== null
                    ? `${numero(i.cantidad, 0)} ${i.unidad ?? ''} `
                    : ''}
                  {i.insumo}
                </Text>
              ))}
            </Box>
          ))
        )}
      </Stack>
    );
  }
  return (
    <Stack gap={4}>
      {cabecera}
      {donde}
      <Text size="sm">{m.concepto}</Text>
    </Stack>
  );
}

function Cuentas({
  cuentas,
  movimientos,
}: {
  cuentas: CuentaDia[];
  movimientos: MovimientoDia[];
}) {
  const total = cuentas.reduce((a, c) => a + Math.max(c.saldo, 0), 0) || 1;
  const grupos = [
    {
      nombre: 'Bancos y billeteras',
      filas: cuentas.filter((c) => c.tipo !== 'CAJA'),
      color: 'violeta',
    },
    {
      nombre: 'Efectivo',
      filas: cuentas.filter((c) => c.tipo === 'CAJA'),
      color: 'orange',
    },
  ];
  let k = 0;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {grupos.map((gr) => (
        <Stack key={gr.nombre} gap="xs">
          <Text fw={700} className="gf-aparece" style={{ '--i': 1 }}>
            {gr.nombre} · {dineroCompacto(gr.filas.reduce((a, c) => a + c.saldo, 0))}
          </Text>
          {gr.filas.length === 0 ? (
            <Text size="sm" c="dimmed">
              Sin cuentas.
            </Text>
          ) : (
            gr.filas.map((c) => {
              const i = ++k + 1;
              const suyos = movimientos.filter((m) => m.cuenta === c.cuenta);
              return (
                <Paper
                  key={c.cuenta}
                  withBorder
                  p="sm"
                  radius="md"
                  className="gf-aparece"
                  style={{ '--i': i }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700} truncate>
                        {c.cuenta}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {[c.banco, c.titular].filter(Boolean).join(' · ') ||
                          (c.tipo === 'CAJA' ? 'Caja' : 'Cuenta')}
                        {c.de_tercero ? ' · de tercero' : ''}
                      </Text>
                    </div>
                    <Text fw={700} size="lg" ff="monospace">
                      {dineroCompacto(c.saldo)}
                    </Text>
                  </Group>
                  <div
                    className="gf-reparto"
                    style={
                      {
                        '--i': i,
                        marginTop: 8,
                        width: `${(Math.max(c.saldo, 0) / total) * 100}%`,
                        background: `var(--mantine-color-${gr.color}-6)`,
                      } as CSSProperties
                    }
                  />
                  <Group gap="md" mt={6}>
                    {c.entro > 0 ? (
                      <Badge color="estadoAprobado" variant="light">
                        Entró {dineroCompacto(c.entro)}
                      </Badge>
                    ) : null}
                    {c.salio > 0 ? (
                      <Badge color="estadoRechazado" variant="light">
                        Salió {dineroCompacto(c.salio)}
                      </Badge>
                    ) : null}
                  </Group>
                  {suyos.map((m) => (
                    <Text
                      key={m.id}
                      size="xs"
                      mt={4}
                      c={m.importe > 0 ? 'estadoAprobado.8' : 'estadoRechazado.8'}
                    >
                      {conSigno(m.importe)} ·{' '}
                      {m.cobro?.cliente ?? m.pago?.proveedor ?? m.contraparte ?? ''}{' '}
                      {m.concepto}
                    </Text>
                  ))}
                </Paper>
              );
            })
          )}
        </Stack>
      ))}
    </SimpleGrid>
  );
}
