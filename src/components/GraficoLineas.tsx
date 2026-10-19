import { useMemo, useState } from 'react';
import { Box, Group, Paper, Text } from '@mantine/core';

export interface SerieLinea {
  nombre: string;
  /** Posición fija en la paleta (1 a 4): el color sigue a la serie, no a su orden. */
  color: 1 | 2 | 3 | 4;
  /** Codificación secundaria además del color (las de precio van punteadas). */
  punteada?: boolean;
  /** Un valor por etiqueta; null = sin dato ese mes (se dibuja como hueco). */
  valores: (number | null)[];
  /** Valores provisorios (IPC estimado): el punto se dibuja hueco. */
  provisorios?: boolean[];
}

const ANCHO = 720;
const M = { arriba: 16, derecha: 96, abajo: 26, izquierda: 8 };

/**
 * Líneas de varias series sobre UN solo eje (nunca dos escalas), escrito a
 * mano en SVG como GraficoArea. Huecos donde falta el dato, guía vertical con
 * todos los valores del mes al pasar, leyenda arriba, etiqueta directa al
 * final de cada línea y la tabla de datos para lectores de pantalla.
 */
export function GraficoLineas({
  etiquetas,
  series,
  formato,
  alto = 260,
  titulo,
}: {
  etiquetas: string[];
  series: SerieLinea[];
  formato: (v: number) => string;
  alto?: number;
  titulo: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);

  const geo = useMemo(() => {
    const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
    if (todos.length === 0 || etiquetas.length === 0) return null;
    const maximo = Math.max(...todos) * 1.08 || 1;
    const altoUtil = alto - M.arriba - M.abajo;
    const anchoUtil = ANCHO - M.izquierda - M.derecha;
    const paso = etiquetas.length > 1 ? anchoUtil / (etiquetas.length - 1) : 0;
    const x = (i: number) => M.izquierda + i * paso;
    const y = (v: number) => M.arriba + altoUtil - (v / maximo) * altoUtil;
    const trazos = series.map((s) => {
      // Un tramo nuevo después de cada hueco: no se inventa el valor que falta.
      let d = '';
      let abierto = false;
      s.valores.forEach((v, i) => {
        if (v === null) {
          abierto = false;
          return;
        }
        d += `${abierto ? 'L' : 'M'} ${x(i)} ${y(v)} `;
        abierto = true;
      });
      const ultimo = s.valores.reduce<number | null>(
        (u, v, i) => (v === null ? u : i),
        null,
      );
      return { d, ultimo };
    });
    return { maximo, x, y, trazos, base: M.arriba + altoUtil, paso };
  }, [series, etiquetas, alto]);

  if (!geo) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin datos para el período.
      </Text>
    );
  }

  const { x, y, trazos, base, maximo, paso } = geo;
  const desdeX = (px: number) =>
    Math.max(
      0,
      Math.min(etiquetas.length - 1, Math.round((px - M.izquierda) / (paso || 1))),
    );

  return (
    <Box>
      {series.length > 1 ? (
        <Group gap="md" mb="xs" wrap="wrap">
          {series.map((s) => (
            <Group key={s.nombre} gap={6} wrap="nowrap">
              <svg width="22" height="10" aria-hidden="true">
                <line
                  x1="1"
                  x2="21"
                  y1="5"
                  y2="5"
                  stroke={`var(--serie-${s.color})`}
                  strokeWidth="2"
                  strokeDasharray={s.punteada ? '5 3' : undefined}
                  strokeLinecap="round"
                />
              </svg>
              <Text size="xs">{s.nombre}</Text>
            </Group>
          ))}
        </Group>
      ) : null}
      <Box style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${ANCHO} ${alto}`}
          width="100%"
          height={alto}
          role="img"
          aria-label={titulo}
          style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setActivo(desdeX(((e.clientX - r.left) / r.width) * ANCHO));
          }}
          onPointerLeave={() => setActivo(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={M.izquierda}
                x2={ANCHO - M.derecha}
                y1={y(maximo * f)}
                y2={y(maximo * f)}
                stroke="var(--superficie-borde)"
                strokeWidth={1}
              />
              {f > 0 ? (
                <text
                  x={M.izquierda}
                  y={y(maximo * f) - 4}
                  fontSize="11"
                  fill="var(--mantine-color-dimmed)"
                >
                  {formato(maximo * f)}
                </text>
              ) : null}
            </g>
          ))}
          {etiquetas.map((e, i) =>
            i % Math.ceil(etiquetas.length / 6) === 0 || i === etiquetas.length - 1 ? (
              <text
                key={e}
                x={x(i)}
                y={base + 18}
                fontSize="11"
                textAnchor="middle"
                fill="var(--mantine-color-dimmed)"
              >
                {e}
              </text>
            ) : null,
          )}
          {series.map((s, k) => (
            <g key={s.nombre}>
              <path
                d={trazos[k]!.d}
                fill="none"
                stroke={`var(--serie-${s.color})`}
                strokeWidth={2}
                strokeDasharray={s.punteada ? '6 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.valores.map((v, i) =>
                v !== null && s.provisorios?.[i] ? (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={4}
                    fill="var(--mantine-color-body)"
                    stroke={`var(--serie-${s.color})`}
                    strokeWidth={2}
                  />
                ) : null,
              )}
              {trazos[k]!.ultimo !== null ? (
                <text
                  x={x(trazos[k]!.ultimo) + 8}
                  y={y(s.valores[trazos[k]!.ultimo]!) + 4}
                  fontSize="11"
                  fill="var(--mantine-color-text)"
                >
                  {s.nombre}
                </text>
              ) : null}
            </g>
          ))}
          {activo !== null ? (
            <g>
              <line
                x1={x(activo)}
                x2={x(activo)}
                y1={M.arriba}
                y2={base}
                stroke="var(--mantine-color-dimmed)"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = s.valores[activo];
                return v === null || v === undefined ? null : (
                  <circle
                    key={s.nombre}
                    cx={x(activo)}
                    cy={y(v)}
                    r={5}
                    fill={`var(--serie-${s.color})`}
                    stroke="var(--mantine-color-body)"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>
        {activo !== null ? (
          <Paper
            shadow="sm"
            p="xs"
            withBorder
            style={{
              position: 'absolute',
              top: 0,
              left: `${Math.min(70, (x(activo) / ANCHO) * 100)}%`,
              pointerEvents: 'none',
              minWidth: 170,
            }}
          >
            <Text size="xs" fw={600} mb={4}>
              {etiquetas[activo]}
            </Text>
            {series.map((s) => {
              const v = s.valores[activo];
              return (
                <Group key={s.nombre} justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    {s.nombre}
                  </Text>
                  <Text size="xs" ff="monospace">
                    {v === null || v === undefined ? '—' : formato(v)}
                    {v !== null && s.provisorios?.[activo] ? ' (prov.)' : ''}
                  </Text>
                </Group>
              );
            })}
          </Paper>
        ) : null}
      </Box>
      <table className="solo-lector">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Mes</th>
            {series.map((s) => (
              <th key={s.nombre}>{s.nombre}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {etiquetas.map((e, i) => (
            <tr key={e}>
              <td>{e}</td>
              {series.map((s) => (
                <td key={s.nombre}>
                  {s.valores[i] == null ? 'sin dato' : formato(s.valores[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
