import { useState } from 'react';
import { Box, Group, Paper, Text } from '@mantine/core';

export interface PuntoResultado {
  etiqueta: string;
  facturacion: number | null;
  costos: number | null;
  provisorio?: boolean;
}

const ANCHO = 720;
const M = { arriba: 18, derecha: 12, abajo: 26, izquierda: 8 };
const GANANCIA = 'var(--mantine-color-green-7)';
const PERDIDA = 'var(--mantine-color-red-7)';

/**
 * Facturación contra costos totales, mes a mes, sobre un solo eje. La
 * diferencia entre las dos líneas se sombrea en verde (ganancia) o rojo
 * (pérdida) y se corta exactamente donde se cruzan; el color no va solo: la
 * burbuja dice «ganancia» o «pérdida» con el importe, y hay tabla para lectores.
 */
export function GraficoResultado({
  puntos,
  formato,
  titulo,
  alto = 280,
}: {
  puntos: PuntoResultado[];
  formato: (v: number) => string;
  titulo: string;
  alto?: number;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const valores = puntos
    .flatMap((p) => [p.facturacion, p.costos])
    .filter((v): v is number => v !== null);
  if (valores.length === 0) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin facturación ni costos cargados todavía.
      </Text>
    );
  }
  const maximo = Math.max(1, ...valores) * 1.08;
  const altoUtil = alto - M.arriba - M.abajo;
  const paso =
    puntos.length > 1 ? (ANCHO - M.izquierda - M.derecha) / (puntos.length - 1) : 0;
  const x = (i: number) => M.izquierda + i * paso;
  const y = (v: number) => M.arriba + altoUtil - (v / maximo) * altoUtil;

  // Sombras: un polígono por tramo entre meses consecutivos con los dos datos;
  // si las líneas se cruzan dentro del tramo, se parte en el cruce.
  const sombras: { d: string; gana: boolean }[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i]!;
    const b = puntos[i + 1]!;
    if (
      a.facturacion === null ||
      a.costos === null ||
      b.facturacion === null ||
      b.costos === null
    )
      continue;
    const da = a.facturacion - a.costos;
    const db = b.facturacion - b.costos;
    const poli = (
      x1: number,
      f1: number,
      c1: number,
      x2: number,
      f2: number,
      c2: number,
    ) => `M ${x1} ${y(f1)} L ${x2} ${y(f2)} L ${x2} ${y(c2)} L ${x1} ${y(c1)} Z`;
    if (da * db >= 0) {
      sombras.push({
        d: poli(x(i), a.facturacion, a.costos, x(i + 1), b.facturacion, b.costos),
        gana: da + db >= 0,
      });
    } else {
      const t = da / (da - db);
      const xc = x(i) + t * paso;
      const vc = a.facturacion + t * (b.facturacion - a.facturacion);
      sombras.push({ d: poli(x(i), a.facturacion, a.costos, xc, vc, vc), gana: da > 0 });
      sombras.push({
        d: poli(xc, vc, vc, x(i + 1), b.facturacion, b.costos),
        gana: db > 0,
      });
    }
  }
  const linea = (k: 'facturacion' | 'costos') => {
    let d = '';
    let abierto = false;
    puntos.forEach((p, i) => {
      const v = p[k];
      if (v === null) {
        abierto = false;
        return;
      }
      d += `${abierto ? 'L' : 'M'} ${x(i)} ${y(v)} `;
      abierto = true;
    });
    return d;
  };
  const p = activo !== null ? puntos[activo] : undefined;
  const dif =
    p && p.facturacion !== null && p.costos !== null ? p.facturacion - p.costos : null;

  return (
    <Box>
      <Group gap="md" mb="xs" wrap="wrap">
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={3} style={{ background: 'var(--serie-1)', borderRadius: 2 }} />
          <Text size="xs">Facturación</Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box w={18} h={3} style={{ background: 'var(--serie-2)', borderRadius: 2 }} />
          <Text size="xs">Costos totales</Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box
            w={12}
            h={12}
            style={{ background: GANANCIA, opacity: 0.25, borderRadius: 3 }}
          />
          <Text size="xs">Ganancia</Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Box
            w={12}
            h={12}
            style={{ background: PERDIDA, opacity: 0.25, borderRadius: 3 }}
          />
          <Text size="xs">Pérdida</Text>
        </Group>
      </Group>
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
            const px = ((e.clientX - r.left) / r.width) * ANCHO;
            setActivo(
              Math.max(
                0,
                Math.min(puntos.length - 1, Math.round((px - M.izquierda) / (paso || 1))),
              ),
            );
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
          {sombras.map((s, i) => (
            <path key={i} d={s.d} fill={s.gana ? GANANCIA : PERDIDA} fillOpacity={0.18} />
          ))}
          <path
            d={linea('costos')}
            fill="none"
            stroke="var(--serie-2)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d={linea('facturacion')}
            fill="none"
            stroke="var(--serie-1)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {puntos.map((pt, i) =>
            i % Math.ceil(puntos.length / 6) === 0 || i === puntos.length - 1 ? (
              <text
                key={pt.etiqueta}
                x={x(i)}
                y={alto - 6}
                fontSize="11"
                textAnchor="middle"
                fill="var(--mantine-color-dimmed)"
              >
                {pt.etiqueta}
              </text>
            ) : null,
          )}
          {activo !== null ? (
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={M.arriba}
              y2={M.arriba + altoUtil}
              stroke="var(--mantine-color-dimmed)"
              strokeWidth={1}
            />
          ) : null}
        </svg>
        {p ? (
          <Paper
            shadow="sm"
            p="xs"
            withBorder
            style={{
              position: 'absolute',
              top: 0,
              left: `${Math.min(68, (((activo ?? 0) * paso + M.izquierda) / ANCHO) * 100)}%`,
              pointerEvents: 'none',
              minWidth: 190,
            }}
          >
            <Text size="xs" fw={600} mb={4}>
              {p.etiqueta}
              {p.provisorio ? ' (IPC estimado)' : ''}
            </Text>
            <Group justify="space-between" gap="sm" wrap="nowrap">
              <Text size="xs" c="dimmed">
                Facturación
              </Text>
              <Text size="xs" ff="monospace">
                {p.facturacion === null ? '—' : formato(p.facturacion)}
              </Text>
            </Group>
            <Group justify="space-between" gap="sm" wrap="nowrap">
              <Text size="xs" c="dimmed">
                Costos totales
              </Text>
              <Text size="xs" ff="monospace">
                {p.costos === null ? '—' : formato(p.costos)}
              </Text>
            </Group>
            {dif !== null ? (
              <Text size="xs" fw={700} c={dif >= 0 ? 'green.7' : 'red.7'} mt={4}>
                {dif >= 0 ? 'Ganancia' : 'Pérdida'} {formato(Math.abs(dif))}
              </Text>
            ) : null}
          </Paper>
        ) : null}
      </Box>
      <table className="solo-lector">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Mes</th>
            <th>Facturación</th>
            <th>Costos totales</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {puntos.map((pt) => (
            <tr key={pt.etiqueta}>
              <td>{pt.etiqueta}</td>
              <td>{pt.facturacion === null ? 'sin dato' : formato(pt.facturacion)}</td>
              <td>{pt.costos === null ? 'sin dato' : formato(pt.costos)}</td>
              <td>
                {pt.facturacion === null || pt.costos === null
                  ? 'sin dato'
                  : `${pt.facturacion - pt.costos >= 0 ? 'ganancia' : 'pérdida'} ${formato(Math.abs(pt.facturacion - pt.costos))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
