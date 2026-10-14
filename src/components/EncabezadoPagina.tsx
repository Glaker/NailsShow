import { Box, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { BotonAyuda } from '@/app/ayuda/BotonAyuda';

interface Props {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}

/**
 * Encabezado de pantalla: título, una línea de qué es, la ayuda de la ruta
 * (src/app/ayuda) y las acciones.
 */
export function EncabezadoPagina({ titulo, descripcion, acciones }: Props) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="xl">
      <Stack gap={4} style={{ minWidth: 0 }}>
        <Title order={1}>{titulo}</Title>
        {descripcion ? (
          <Text c="dimmed" size="md">
            {descripcion}
          </Text>
        ) : null}
      </Stack>
      <Group gap="sm">
        <BotonAyuda titulo={titulo} />
        {acciones ? <Box>{acciones}</Box> : null}
      </Group>
    </Group>
  );
}
