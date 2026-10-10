import { useState } from 'react';
import { Box, Group, Paper, Text } from '@mantine/core';

export interface BarraPareto {
  nombre: string;
  participacion: number; // 0..1
  acumulado: number; // 0..1
  clase: 'A' | 'B' | 'C';
  detalle?: string;
}

const ANCHO = 720;
const M = { arriba: 16, derecha: 40, abajo: 22, izquierda: 34 };
// Azul, naranja y uva: validados en claro y oscuro (azul y cian no se distinguen en oscuro).
export const COLOR_CLASE: Record<'A' | 'B' | 'C', 1 | 2 | 4> = { A: 1, B: 2, C: 4 };

/**
 * Curva de Pareto sobre UN eje en porcentaje (0 a 100 %): barras con la
 * participación de cada producto, ordenadas de mayor a menor y coloreadas por
 * clase, y la curva del acumulado. Los cortes A y B se marcan con líneas
 * horizontales rotuladas. Nunca dos escalas.
 */
export function GraficoPareto({
  barras,
  corteA,
  corteB,
  titulo,
  alto = 260,
}: {
  barras: BarraPareto[];
  corteA: number;
  corteB: number;
  titulo: string;
  alto?: number;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  if (barras.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin facturación en el período.
      </Text>
    );
  }
  const altoUtil = alto - M.arriba - M.abajo;
  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const paso = anchoUtil / barras.length;
  const ancho = Math.max(2, paso - 2); // 2px de superficie entre barras
  const y = (v: number) => M.arriba + altoUtil - v * altoUtil;
  const x = (i: number) => M.izquierda + i * paso;
  const curva = barras.map((b, i) => `${i ? 'L' : 'M'} ${x(i) + paso / 2} ${y(b.acumulado)}`).join(' ');
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const b = activa !== null ? barras[activa] : undefined;

  return (
    <Box>
      <Group gap="md" mb="xs" wrap="wrap">
        {(['A', 'B', 'C'] as const).map((c) => (
          <Group key={c} gap={6} wrap="nowrap">
            <Box w={12} h={12} style={{ borderRadius: 3, background: `var(--serie-${COLOR_CLASE[c]})` }} />
            <Text size="xs">Clase {c}</Text>
          </Group>
        ))}
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={2} style={{ background: 'var(--mantine-color-text)' }} />
          <Text size="xs">Acumulado</Text>
        </Group>
      </Group>
      <Box style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${ANCHO} ${alto}`}
          width="100%"
          height={alto}
          role="img"
          aria-label={titulo}
          style={{ display: 'block', overflow: 'visible' }}
          onPointerLeave={() => setActiva(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(f)} y2={y(f)} stroke="var(--superficie-borde)" />
              <text x={M.izquierda - 6} y={y(f) + 4} fontSize="11" textAnchor="end" fill="var(--mantine-color-dimmed)">
                {pct(f)}
              </text>
            </g>
          ))}
          {barras.map((br, i) => {
            const h = Math.max(1, br.participacion * altoUtil);
            const r = Math.min(4, h, ancho / 2);
            const x0 = x(i) + 1;
            const top = y(br.participacion);
            return (
              <path
                key={br.nombre + i}
                d={`M ${x0} ${y(0)} V ${top + r} Q ${x0} ${top} ${x0 + r} ${top} H ${x0 + ancho - r} Q ${x0 + ancho} ${top} ${x0 + ancho} ${top + r} V ${y(0)} Z`}
                fill={`var(--serie-${COLOR_CLASE[br.clase]})`}
                opacity={activa !== null && activa !== i ? 0.55 : 1}
                onPointerEnter={() => setActiva(i)}
              />
            );
          })}
          <path d={curva} fill="none" stroke="var(--mantine-color-text)" strokeWidth={2} strokeLinejoin="round" />
          {[
            { v: corteA, t: `A ${pct(corteA)}` },
            { v: corteB, t: `B ${pct(corteB)}` },
          ].map((c) => (
            <g key={c.t}>
              <line
                x1={M.izquierda}
                x2={ANCHO - M.derecha}
                y1={y(c.v)}
                y2={y(c.v)}
                stroke="var(--mantine-color-dimmed)"
                strokeDasharray="5 4"
              />
              <text x={ANCHO - M.derecha + 4} y={y(c.v) + 4} fontSize="11" fill="var(--mantine-color-dimmed)">
                {c.t}
              </text>
            </g>
          ))}
        </svg>
        {b ? (
          <Paper
            shadow="sm"
            p="xs"
            withBorder
            style={{
              position: 'absolute',
              top: 0,
              left: `${Math.min(66, ((x(activa!) + paso / 2) / ANCHO) * 100)}%`,
              pointerEvents: 'none',
              minWidth: 200,
            }}
          >
            <Text size="xs" fw={600}>
              {b.nombre}
            </Text>
            <Text size="xs" c="dimmed">
              Clase {b.clase} · {pct(b.participacion)} de la facturación · acumulado {pct(b.acumulado)}
            </Text>
            {b.detalle ? <Text size="xs">{b.detalle}</Text> : null}
          </Paper>
        ) : null}
      </Box>
      <table className="solo-lector">
        <caption>{titulo}</caption>
        <tbody>
          {barras.map((br) => (
            <tr key={br.nombre}>
              <th>{br.nombre}</th>
              <td>Clase {br.clase}</td>
              <td>{pct(br.participacion)}</td>
              <td>acumulado {pct(br.acumulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
