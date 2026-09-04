import { useId, useMemo, useState } from 'react';
import { Box, Paper, Text } from '@mantine/core';

export interface PuntoSerie {
  etiqueta: string;
  valor: number;
}

/* Geometría del lienzo. Fuera del componente: son constantes, no estado. */
const ANCHO = 700;
const MARGEN = { arriba: 16, derecha: 8, abajo: 24, izquierda: 8 };

interface Props {
  datos: PuntoSerie[];
  alto?: number;
  /** Texto que se muestra en la burbuja: «3 recepciones». */
  unidad?: string;
}

/**
 * Gráfico de área de una sola serie.
 *
 * Está escrito a mano en SVG en vez de traer una biblioteca de gráficos: es una
 * curva, un relleno y una guía vertical, y una dependencia nueva es superficie
 * de validación (CLAUDE.md §7). Si en algún momento hacen falta ejes con
 * escalas, barras apiladas y leyendas, ahí sí conviene una biblioteca y se
 * justifica en el PR.
 *
 * La curva es una Catmull-Rom convertida a Bézier: pasa por todos los puntos
 * reales. Un suavizado que *no* pase por los puntos dibujaría valores que no
 * ocurrieron, y este gráfico muestra actividad registrada.
 */
export function GraficoArea({ datos, alto = 220, unidad = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const [activo, setActivo] = useState<number | null>(null);

  const geometria = useMemo(() => {
    if (datos.length === 0) return null;

    const maximo = Math.max(1, ...datos.map((d) => d.valor));
    const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;
    const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const paso = datos.length > 1 ? anchoUtil / (datos.length - 1) : 0;

    const puntos = datos.map((d, i) => ({
      x: MARGEN.izquierda + i * paso,
      y: MARGEN.arriba + altoUtil - (d.valor / maximo) * altoUtil,
    }));

    /* Catmull-Rom → Bézier cúbica, con tensión estándar (1/6). */
    const primero = puntos[0]!;
    const ultimo = puntos[puntos.length - 1]!;

    let curva = `M ${primero.x} ${primero.y}`;
    for (let i = 0; i < puntos.length - 1; i++) {
      const p1 = puntos[i]!;
      const p2 = puntos[i + 1]!;
      const p0 = puntos[i - 1] ?? p1;
      const p3 = puntos[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      curva += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }

    const base = MARGEN.arriba + altoUtil;
    const relleno = `${curva} L ${ultimo.x} ${base} L ${primero.x} ${base} Z`;

    return { puntos, curva, relleno, maximo, base };
  }, [datos, alto]);

  if (!geometria) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="xl">
        Sin datos para el período.
      </Text>
    );
  }

  const { puntos, curva, relleno, maximo, base } = geometria;
  const punto = activo !== null ? (puntos[activo] ?? null) : null;

  return (
    <Box style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label="Actividad diaria"
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setActivo(null)}
      >
        <defs>
          <linearGradient id={`relleno-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--mantine-color-violeta-5)"
              stopOpacity="0.28"
            />
            <stop
              offset="100%"
              stopColor="var(--mantine-color-violeta-5)"
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient id={`linea-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--mantine-color-violeta-7)" />
            <stop offset="100%" stopColor="var(--mantine-color-rosa-6)" />
          </linearGradient>
        </defs>

        {/* Guías horizontales: tres, con el máximo arriba. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={MARGEN.arriba + (alto - MARGEN.arriba - MARGEN.abajo) * f}
            y2={MARGEN.arriba + (alto - MARGEN.arriba - MARGEN.abajo) * f}
            stroke="var(--superficie-borde)"
            strokeWidth={1}
          />
        ))}

        <path d={relleno} fill={`url(#relleno-${id})`} />
        <path
          d={curva}
          fill="none"
          stroke={`url(#linea-${id})`}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {punto ? (
          <>
            <line
              x1={punto.x}
              x2={punto.x}
              y1={MARGEN.arriba}
              y2={base}
              stroke="var(--mantine-color-violeta-3)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={punto.x}
              cy={punto.y}
              r={5.5}
              fill="#fff"
              stroke="var(--mantine-color-violeta-7)"
              strokeWidth={2.5}
            />
          </>
        ) : null}

        {/* Zonas de toque: una por punto, del alto completo. Con guantes, un
            objetivo de 5 px no se acierta. */}
        {puntos.map((p, i) => (
          <rect
            key={i}
            x={p.x - ANCHO / Math.max(1, puntos.length) / 2}
            y={0}
            width={ANCHO / Math.max(1, puntos.length)}
            height={alto}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
            onTouchStart={() => setActivo(i)}
          />
        ))}
      </svg>

      {/* Etiquetas del eje horizontal: solo primera, media y última. Doce
          fechas apretadas no se leen en una tablet. */}
      <Box
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
        }}
      >
        {[0, Math.floor(datos.length / 2), datos.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx && datos[i])
          .map((i) => (
            <Text key={i} size="xs" c="dimmed">
              {datos[i]!.etiqueta}
            </Text>
          ))}
      </Box>

      {punto && activo !== null ? (
        <Paper
          shadow="md"
          p="xs"
          withBorder
          style={{
            position: 'absolute',
            left: `calc(${(punto.x / ANCHO) * 100}% - 60px)`,
            top: 0,
            width: 120,
            pointerEvents: 'none',
            textAlign: 'center',
            borderColor: 'var(--superficie-borde)',
          }}
        >
          <Text size="xs" c="dimmed">
            {datos[activo]?.etiqueta}
          </Text>
          <Text fw={700} size="sm">
            {datos[activo]?.valor} {unidad}
          </Text>
        </Paper>
      ) : null}

      <Text size="xs" c="dimmed" style={{ position: 'absolute', top: 0, right: 0 }}>
        máx. {maximo}
      </Text>
    </Box>
  );
}
