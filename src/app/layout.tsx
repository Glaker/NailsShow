import { type ReactNode } from 'react';
import { AppShell, Group, Text } from '@mantine/core';

/**
 * Cascarón de la aplicación.
 *
 * La navegación lateral por rol se arma en la fase 2 (prompt 2.2), una vez que
 * existan `core.usuarios` y la matriz de permisos de §3.3. Por ahora el layout
 * es sólo estructura.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <AppShell header={{ height: 52 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Trazabilidad — Nail Show SRL</Text>
          <Text size="xs" c="dimmed">
            Fase 0 · andamiaje
          </Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
