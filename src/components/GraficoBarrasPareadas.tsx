import { useState } from 'react';
import { Box, Group, Text } from '@mantine/core';

export interface GrupoBarras {
  etiqueta: string;
  /** Debajo de la etiqueta: «margen 34 %». */
  nota?: string;
  valores: { nombre: string; valor: number; color: 1 | 2 | 3 | 4 }[];
}

const ANCHO = 720;
const M = { arriba: 22, abajo: 44 };
const BARRA = 34;
const SEPARACION = 2; // 2px de superficie entre barras vecinas

/**
 * Barras agrupadas sobre un solo eje que arranca en cero (costo contra precio
 * de cada banda). Extremos de datos redondeados, valor sobre cada barra (son
 * pocas), leyenda arriba y tabla para lectores de pantalla.
 */
export function GraficoBarrasPareadas({
  grupos,
  formato,
  titulo,
  alto = 240,
}: {
  grupos: GrupoBarras[];
  formato: (v: number) => string;
  titulo: string;
  alto?: number;
}) {
  const [activa, setActiva] = useState<string | null>(null);
  if (grupos.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin precios cargados para comparar.
      </Text>
    );
  }
  const nombres = [...new Map(grupos.flatMap((g) => g.valores).map((v) => [v.nombre, v])).values()];
  const maximo = Math.max(1, ...grupos.flatMap((g) => g.valores.map((v) => v.valor))) * 1.12;
  const altoUtil = alto - M.arriba - M.abajo;
  const anchoGrupo = ANCHO / grupos.length;
  const h = (v: number) => (Math.max(0, v) / maximo) * altoUtil;
  const base = M.arriba + altoUtil;

  return (
    <Box>
      <Group gap="md" mb="xs" wrap="wrap">
        {nombres.map((n) => (
          <Group key={n.nombre} gap={6} wrap="nowrap">
            <Box w={12} h={12} style={{ borderRadius: 3, background: `var(--serie-${n.color})` }} />
            <Text size="xs">{n.nombre}</Text>
          </Group>
        ))}
      </Group>
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label={titulo}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <line x1={0} x2={ANCHO} y1={base} y2={base} stroke="var(--superficie-borde)" strokeWidth={1} />
        {grupos.map((g, gi) => {
          const ancho = g.valores.length * BARRA + (g.valores.length - 1) * SEPARACION;
          const x0 = gi * anchoGrupo + (anchoGrupo - ancho) / 2;
          return (
            <g key={g.etiqueta}>
              {g.valores.map((v, vi) => {
                const xb = x0 + vi * (BARRA + SEPARACION);
                const alt = h(v.valor);
                const id = `${g.etiqueta}-${v.nombre}`;
                const r = Math.min(4, alt);
                return (
                  <g
                    key={v.nombre}
                    onPointerEnter={() => setActiva(id)}
                    onPointerLeave={() => setActiva(null)}
                  >
                    {/* Extremo redondeado arriba, base recta sobre el eje. */}
                    <path
                      d={`M ${xb} ${base} V ${base - alt + r} Q ${xb} ${base - alt} ${xb + r} ${base - alt}
                          H ${xb + BARRA - r} Q ${xb + BARRA} ${base - alt} ${xb + BARRA} ${base - alt + r} V ${base} Z`}
                      fill={`var(--serie-${v.color})`}
                      opacity={activa && activa !== id ? 0.55 : 1}
                    />
                    <text
                      x={xb + BARRA / 2}
                      y={base - alt - 6}
                      fontSize="11"
                      textAnchor="middle"
                      fill="var(--mantine-color-text)"
                    >
                      {formato(v.valor)}
                    </text>
                  </g>
                );
              })}
              <text
                x={gi * anchoGrupo + anchoGrupo / 2}
                y={base + 18}
                fontSize="12"
                textAnchor="middle"
                fill="var(--mantine-color-text)"
              >
                {g.etiqueta}
              </text>
              {g.nota ? (
                <text
                  x={gi * anchoGrupo + anchoGrupo / 2}
                  y={base + 34}
                  fontSize="11"
                  textAnchor="middle"
                  fill="var(--mantine-color-dimmed)"
                >
                  {g.nota}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <table className="solo-lector">
        <caption>{titulo}</caption>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.etiqueta}>
              <th>{g.etiqueta}</th>
              {g.valores.map((v) => (
                <td key={v.nombre}>
                  {v.nombre}: {formato(v.valor)}
                </td>
              ))}
              <td>{g.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
