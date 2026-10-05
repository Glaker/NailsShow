import { Center, Stack, Text } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface Props {
  icono: Icon;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}

/**
 * Estado vacío.
 *
 * Una tabla vacía sin explicación se lee como una falla del sistema. Acá se
 * dice qué falta y, cuando corresponde, cómo cargarlo.
 */
export function Vacio({ icono: Icono, titulo, descripcion, accion }: Props) {
  return (
    <Center py={56} className="entrada">
      <Stack align="center" gap="xs" maw={420}>
        <Icono
          size={34}
          stroke={1.3}
          color="var(--mantine-color-dimmed)"
          aria-hidden="true"
        />
        <Text fw={600} mt="xs">
          {titulo}
        </Text>
        {descripcion ? (
          <Text size="sm" c="dimmed" ta="center">
            {descripcion}
          </Text>
        ) : null}
        {accion ? <div style={{ marginTop: 8 }}>{accion}</div> : null}
      </Stack>
    </Center>
  );
}
