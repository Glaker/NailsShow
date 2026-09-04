import { Group, Paper, Text, ThemeIcon } from '@mantine/core';
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
 * Indicador del tablero.
 *
 * Un número grande, su etiqueta, y una línea de contexto. La línea de contexto
 * es la que hace útil al indicador: «12 en cuarentena» no dice nada por sí
 * solo; «12 en cuarentena, 3 hace más de una semana» dice qué hacer hoy.
 */
export function TarjetaIndicador({
  etiqueta,
  valor,
  icono: Icono,
  color = 'violeta',
  detalle,
  a,
}: Props) {
  const estilo = {
    borderColor: 'var(--superficie-borde)',
    textDecoration: 'none',
    display: 'block',
    transition: 'transform var(--transicion), box-shadow var(--transicion)',
  } as const;

  const cuerpo = (
    <>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" c="dimmed" fw={500} truncate>
            {etiqueta}
          </Text>
          <Text fz={30} fw={700} lh={1.15} mt={6} c="ciruela.8">
            {valor}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size={44} radius="md">
          <Icono size={22} stroke={1.7} />
        </ThemeIcon>
      </Group>
      {detalle ? (
        <Text size="xs" c="dimmed" mt="sm">
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
