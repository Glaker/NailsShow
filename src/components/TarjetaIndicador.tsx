import { Group, Paper, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  etiqueta: string;
  valor: ReactNode;
  icono: Icon;
  /** Color del tema. Para indicadores de material, siempre uno de los de I.20.2. */
  color?: string;
  /** Línea al pie: contexto del número, no adorno. */
  detalle?: ReactNode;
  /** Si se pasa, la tarjeta entera es un enlace. */
  a?: string;
}

/**
 * Indicador del tablero: la etiqueta, la cifra grande y la línea de contexto.
 * Si el indicador es de material, un punto con el color de su estado según
 * I.20.2; si no, nada de color.
 *
 * La línea de contexto es la que hace útil al indicador: «12 en cuarentena» no
 * dice nada por sí solo; «12 en cuarentena, 3 hace más de una semana» dice qué
 * hacer hoy.
 */
export function TarjetaIndicador({
  etiqueta,
  valor,
  icono: Icono,
  color = 'azul',
  detalle,
  a,
}: Props) {
  const estilo = {
    borderColor: 'var(--superficie-borde)',
    textDecoration: 'none',
    display: 'block',
    color: 'inherit',
    transition: 'transform var(--transicion), box-shadow var(--transicion)',
  } as const;

  const cuerpo = (
    <>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Icono size={16} stroke={1.7} color="var(--mantine-color-dimmed)" />
          <Text size="sm" c="dimmed" fw={500} truncate>
            {etiqueta}
          </Text>
        </Group>
        {/* Punto de estado, solo para indicadores de material (I.20.2): un
            indicador que no es de estado no lleva color, así el color siempre
            significa lo mismo que en el rótulo pegado al envase. */}
        {color.startsWith('estado') ? (
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              marginTop: 5,
              flexShrink: 0,
              borderRadius: '50%',
              background: `var(--mantine-color-${color}-filled)`,
            }}
          />
        ) : null}
      </Group>
      <Text fz={36} lh={1.05} mt={12} className="cifra">
        {valor}
      </Text>
      {detalle ? (
        <Text size="xs" c="dimmed" mt={8}>
          {detalle}
        </Text>
      ) : null}
    </>
  );

  /* Dos formas del mismo componente: tarjeta muerta o tarjeta que navega. Se
     separan en vez de pasar `component` condicional porque Mantine tipa las
     props del elemento subyacente, y un `component` que a veces es Link y a
     veces 'div' no tiene un tipo común. */
  if (a) {
    return (
      <Paper
        component={Link}
        to={a}
        p="lg"
        withBorder
        style={estilo}
        className="tarjeta-enlace"
      >
        {cuerpo}
      </Paper>
    );
  }

  return (
    <Paper p="lg" withBorder style={estilo}>
      {cuerpo}
    </Paper>
  );
}
