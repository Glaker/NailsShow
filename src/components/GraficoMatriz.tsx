import { useState } from 'react';
import { Box, Group, Paper, Text } from '@mantine/core';
import { COLOR_CLASE } from './GraficoPareto';

export interface PuntoMatriz {
  nombre: string;
  participacion: number; // 0..1, eje horizontal
  margen: number; // fracción, eje vertical
  clase: 'A' | 'B' | 'C';
}

const ANCHO = 720;
const M = { arriba: 18, derecha: 16, abajo: 34, izquierda: 44 };

/**
 * Matriz facturación × margen: cada producto es un punto (participación en la
 * facturación contra margen sobre el precio), del color de su clase ABC. La
 * línea punteada es el margen mínimo de Finanzas; los cuadrantes se rotulan
 * con la decisión que piden (un A de margen bajo no es lo mismo que un C de
 * margen alto). La participación va en raíz cuadrada para que los C no se
 * amontonen contra el eje.
 */
export function GraficoMatriz({
  puntos,
  margenMinimo,
  titulo,
  alto = 320,
}: {
  puntos: PuntoMatriz[];
  margenMinimo: number;
  titulo: string;
  alto?: number;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  if (puntos.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin productos con costo y facturación en el período.
      </Text>
    );
  }
  const maxP = Math.max(...puntos.map((p) => p.participacion), 0.01);
  const minM = Math.min(0, ...puntos.map((p) => p.margen));
  const maxM = Math.max(margenMinimo * 1.5, ...puntos.map((p) => p.margen)) * 1.05;
  const altoUtil = alto - M.arriba - M.abajo;
  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const x = (v: number) => M.izquierda + Math.sqrt(v / maxP) * anchoUtil;
  const y = (v: number) => M.arriba + altoUtil - ((v - minM) / (maxM - minM)) * altoUtil;
  const xMedio = x(maxP / 4); // mitad visual de la escala en raíz
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const p = activo !== null ? puntos[activo] : undefined;

  return (
    <Box>
      <Group gap="md" mb="xs" wrap="wrap">
        {(['A', 'B', 'C'] as const).map((c) => (
          <Group key={c} gap={6} wrap="nowrap">
            <Box w={10} h={10} style={{ borderRadius: 10, background: `var(--serie-${COLOR_CLASE[c]})` }} />
            <Text size="xs">Clase {c}</Text>
          </Group>
        ))}
      </Group>
      <Box style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${ANCHO} ${alto}`}
          width="100%"
          height={alto}
          role="img"
          aria-label={titulo}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(0)} y2={y(0)} stroke="var(--superficie-borde)" />
          <line x1={M.izquierda} x2={M.izquierda} y1={M.arriba} y2={M.arriba + altoUtil} stroke="var(--superficie-borde)" />
          <line
            x1={M.izquierda}
            x2={ANCHO - M.derecha}
            y1={y(margenMinimo)}
            y2={y(margenMinimo)}
            stroke="var(--mantine-color-dimmed)"
            strokeDasharray="5 4"
          />
          <text x={ANCHO - M.derecha} y={y(margenMinimo) - 6} fontSize="11" textAnchor="end" fill="var(--mantine-color-dimmed)">
            margen mínimo {pct(margenMinimo)}
          </text>
          {[
            { t: 'Mucha venta, margen bajo: revisar precio o costo', xx: ANCHO - M.derecha - 4, yy: y(minM) - 6, a: 'end' },
            { t: 'Poca venta, margen alto: empujar', xx: M.izquierda + 4, yy: M.arriba + 10, a: 'start' },
          ].map((c) => (
            <text key={c.t} x={c.xx} y={c.yy} fontSize="11" textAnchor={c.a as 'start' | 'end'} fill="var(--mantine-color-dimmed)">
              {c.t}
            </text>
          ))}
          <line x1={xMedio} x2={xMedio} y1={M.arriba} y2={M.arriba + altoUtil} stroke="var(--superficie-borde)" strokeDasharray="2 4" />
          {[minM, margenMinimo, maxM / 1.05].map((v) => (
            <text key={v} x={M.izquierda - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="var(--mantine-color-dimmed)">
              {pct(v)}
            </text>
          ))}
          <text x={ANCHO / 2} y={alto - 4} fontSize="11" textAnchor="middle" fill="var(--mantine-color-dimmed)">
            Participación en la facturación →
          </text>
          {puntos.map((pt, i) => (
            <g key={pt.nombre + i} onPointerEnter={() => setActivo(i)} onPointerLeave={() => setActivo(null)}>
              {/* Área de toque más grande que la marca. */}
              <circle cx={x(pt.participacion)} cy={y(pt.margen)} r={14} fill="transparent" />
              <circle
                cx={x(pt.participacion)}
                cy={y(pt.margen)}
                r={activo === i ? 7 : 5}
                fill={`var(--serie-${COLOR_CLASE[pt.clase]})`}
                stroke="var(--mantine-color-body)"
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
        {p ? (
          <Paper
            shadow="sm"
            p="xs"
            withBorder
            style={{
              position: 'absolute',
              top: 0,
              left: `${Math.min(64, (x(p.participacion) / ANCHO) * 100)}%`,
              pointerEvents: 'none',
              minWidth: 200,
            }}
          >
            <Text size="xs" fw={600}>
              {p.nombre}
            </Text>
            <Text size="xs" c="dimmed">
              Clase {p.clase} · {pct(p.participacion)} de la facturación · margen {pct(p.margen)}
            </Text>
          </Paper>
        ) : null}
      </Box>
      <table className="solo-lector">
        <caption>{titulo}</caption>
        <tbody>
          {puntos.map((pt) => (
            <tr key={pt.nombre}>
              <th>{pt.nombre}</th>
              <td>Clase {pt.clase}</td>
              <td>{pct(pt.participacion)} de la facturación</td>
              <td>margen {pct(pt.margen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
