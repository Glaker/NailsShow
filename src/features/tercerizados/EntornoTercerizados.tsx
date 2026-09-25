import type { ReactNode } from 'react';
import { Box, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconBuildingFactory2 } from '@tabler/icons-react';

/**
 * Marco de la sección Tercerizados: cabecera oscura y fondo más oscuro que el
 * de Nail Show, para que se note de un vistazo en qué entorno se está
 * trabajando (estilos en global.css, `.entorno-tercerizados`).
 */
export function EntornoTercerizados({
  titulo,
  descripcion,
  acciones,
  color,
  children,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  /** Color del cliente, si la pantalla es de uno. */
  color?: string;
  children: ReactNode;
}) {
  return (
    <Box className="entorno-tercerizados">
      <Box
        className="entorno-cabecera"
        style={
          color
            ? { borderBottom: `4px solid var(--mantine-color-${color}-5)` }
            : undefined
        }
      >
        <Group justify="space-between" align="center" gap="md">
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon size={46} radius="md" variant="filled" color={color ?? 'indigo'}>
              <IconBuildingFactory2 size={26} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="xs" fw={700} c="#aab3c5" style={{ letterSpacing: 1.2 }}>
                TERCERIZADOS
              </Text>
              <Text fz={24} fw={800} lh={1.15} c="#fff">
                {titulo}
              </Text>
              {descripcion ? (
                <Text size="sm" c="#c9d0dd">
                  {descripcion}
                </Text>
              ) : null}
            </Stack>
          </Group>
          {acciones ? <Box>{acciones}</Box> : null}
        </Group>
      </Box>
      <Box className="entorno-cuerpo">{children}</Box>
    </Box>
  );
}
