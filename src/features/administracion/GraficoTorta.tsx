import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { dineroCompacto, numero } from '@/lib/formato';
import './graficos.css';

export interface PorcionTorta {
  nombre: string;
  valor: number;
}

const COLORES = ['violeta', 'rosa', 'ciruela', 'blue', 'teal', 'orange'];
const MAXIMO = COLORES.length;
const R = 70;
const C = 2 * Math.PI * R;

const reducido = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Dona de una sola serie, escrita a mano en SVG como GraficoArea (sin
 * biblioteca de gráficos: CLAUDE.md §7). Las seis porciones más grandes y el
 * resto como «Otros». Cada porción se barre al montar, una detrás de otra.
 */
export function GraficoTorta({
  titulo,
  datos,
  aviso,
}: {
  titulo: string;
  datos: PorcionTorta[];
  aviso?: string | undefined;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const porciones = useMemo(() => {
    const positivos = datos.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor);
    const top = positivos.slice(0, MAXIMO);
    const resto = positivos.slice(MAXIMO).reduce((a, d) => a + d.valor, 0);
    const lista =
      resto > 0
        ? [
            ...top.slice(0, MAXIMO - 1),
            { nombre: 'Otros', valor: resto + (top[MAXIMO - 1]?.valor ?? 0) },
          ]
        : top;
    const total = lista.reduce((a, d) => a + d.valor, 0);
    const largos = lista.map((d) => (total ? (d.valor / total) * C : 0));
    return {
      total,
      lista: lista.map((d, i) => ({
        ...d,
        color: d.nombre === 'Otros' ? 'gray' : COLORES[i % COLORES.length]!,
        largo: largos[i]!,
        // Dónde empieza: la suma de las porciones anteriores.
        desde: largos.slice(0, i).reduce((a, l) => a + l, 0),
        pct: total ? (d.valor / total) * 100 : 0,
      })),
    };
  }, [datos]);

  // Barrido de cada porción al montar o al cambiar los datos.
  useLayoutEffect(() => {
    if (reducido() || !svg.current) return;
    svg.current.querySelectorAll<SVGCircleElement>('.gf-torta-seg').forEach((el, i) => {
      const largo = Number(el.dataset.largo);
      el.animate([{ strokeDasharray: `0 ${C}` }, { strokeDasharray: `${largo} ${C}` }], {
        duration: 620,
        delay: i * 90,
        easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)',
        fill: 'backwards',
      });
    });
  }, [porciones]);

  const foco = activa === null ? null : porciones.lista[activa];

  return (
    <Paper
      withBorder
      p="md"
      radius="lg"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Group justify="space-between" mb="sm">
        <Text fw={700}>{titulo}</Text>
        {aviso ? (
          <Badge color="gray" variant="outline" radius="sm">
            {aviso}
          </Badge>
        ) : null}
      </Group>
      {porciones.total === 0 ? (
        <Text size="sm" c="dimmed" py="xl" ta="center">
          Sin movimientos en el período.
        </Text>
      ) : (
        <Group align="center" gap="lg" wrap="nowrap">
          <svg
            ref={svg}
            className="gf-torta"
            data-foco={activa !== null}
            viewBox="0 0 200 200"
            width={180}
            height={180}
            role="img"
            aria-label={`${titulo}: ${porciones.lista.map((p) => `${p.nombre} ${numero(p.pct, 0)} %`).join(', ')}`}
            style={{ flexShrink: 0 }}
            onMouseLeave={() => setActiva(null)}
          >
            <g transform="rotate(-90 100 100)">
              {porciones.lista.map((p, i) => (
                <circle
                  key={p.nombre}
                  className="gf-torta-seg"
                  data-activa={activa === i}
                  data-largo={Math.max(p.largo - 1.5, 0.5)}
                  cx={100}
                  cy={100}
                  r={R}
                  stroke={`var(--mantine-color-${p.color}-6)`}
                  strokeWidth={22}
                  strokeDasharray={`${Math.max(p.largo - 1.5, 0.5)} ${C}`}
                  strokeDashoffset={-p.desde}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => setActiva(activa === i ? null : i)}
                />
              ))}
            </g>
            <text
              className="gf-torta-centro"
              x={100}
              y={foco ? 94 : 100}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 22, fontWeight: 700, fill: 'var(--mantine-color-text)' }}
            >
              {dineroCompacto(foco ? foco.valor : porciones.total)}
            </text>
            <text
              x={100}
              y={foco ? 116 : 122}
              textAnchor="middle"
              style={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
            >
              {foco ? `${numero(foco.pct, 1)} %` : 'total'}
            </text>
          </svg>
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            {porciones.lista.map((p, i) => (
              <Group
                key={p.nombre}
                className="gf-leyenda-fila"
                data-activa={activa === i}
                gap={8}
                wrap="nowrap"
                onMouseEnter={() => setActiva(i)}
                onMouseLeave={() => setActiva(null)}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    flexShrink: 0,
                    background: `var(--mantine-color-${p.color}-6)`,
                  }}
                />
                <Text size="sm" truncate style={{ flex: 1 }} title={p.nombre}>
                  {p.nombre}
                </Text>
                <Text size="sm" fw={600} ff="monospace">
                  {dineroCompacto(p.valor)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Group>
      )}
    </Paper>
  );
}
