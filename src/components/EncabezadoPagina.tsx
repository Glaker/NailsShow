import { Box, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}

/** Encabezado de pantalla: título, una línea de qué es, y las acciones. */
export function EncabezadoPagina({ titulo, descripcion, acciones }: Props) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="lg">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Title order={1}>{titulo}</Title>
        {descripcion ? (
          <Text c="dimmed" size="sm">
            {descripcion}
          </Text>
        ) : null}
      </Stack>
      {acciones ? <Box>{acciones}</Box> : null}
    </Group>
  );
}
