import { Group, Text, useComputedColorScheme } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import MagicBento from '@/vendor/reactbits/MagicBento';
import { VISIBLE } from './bentoVisible';

export interface Indicador {
  etiqueta: string;
  valor: ReactNode;
  icono: Icon;
  /** Color del tema para el ícono y la cifra (p. ej. «estadoCuarentena»). */
  color?: string;
  detalle?: ReactNode;
  /** A dónde lleva tocar la tarjeta. */
  a?: string;
}

/**
 * Indicadores del Tablero en la grilla de MagicBento (React Bits, 2026-11-06):
 * brillo de borde y luz que siguen al cursor, y una onda al tocar. Cada
 * tarjeta lleva a su pantalla, como antes. Con reducción de movimiento,
 * quietas.
 */
export function BentoIndicadores({
  indicadores,
  columnas,
  alto = 140,
}: {
  indicadores: Indicador[];
  columnas: number;
  alto?: number;
}) {
  const navegar = useNavigate();
  const esquema = useComputedColorScheme('light');
  return (
    <MagicBento
      columns={columnas}
      rowHeight={alto}
      gap={12}
      radius={18}
      theme={esquema === 'dark' ? 'dark' : 'light'}
      glowColor="#be4bdb"
      spotlightRadius={280}
      clickEffect
      enableTilt
      enableStars
      particleCount={18}
      textAutoHide={false}
      style={VISIBLE}
      onItemClick={(item) => {
        if (item.id) void navegar(item.id);
      }}
      items={indicadores.map((x) => {
        const Icono = x.icono;
        const color = x.color ?? 'azul';
        return {
          ...(x.a ? { id: x.a } : {}),
          title: x.etiqueta,
          content: (
            <div>
              <Group gap={8} wrap="nowrap">
                <Icono size={20} stroke={1.7} color={`var(--mantine-color-${color}-6)`} />
                <Text fw={600} size="sm" truncate>
                  {x.etiqueta}
                </Text>
              </Group>
              <Text fz={38} lh={1.05} mt={10} fw={650} c={`${color}.7`} className="cifra">
                {x.valor}
              </Text>
              {x.detalle ? (
                <Text size="xs" mt={6} style={{ opacity: 0.7 }}>
                  {x.detalle}
                </Text>
              ) : null}
            </div>
          ),
        };
      })}
    />
  );
}
