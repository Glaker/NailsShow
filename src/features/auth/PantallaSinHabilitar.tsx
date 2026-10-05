import { Box, Button, Center, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconClockPause, IconLogout, IconRefresh } from '@tabler/icons-react';
import { Marca } from '@/components/Marca';
import { useSesion } from './sesion';

/**
 * Cuenta creada pero sin rol asignado.
 *
 * El hook de access token deja el claim `rol` en NULL cuando el usuario está
 * desactivado, y todas las políticas RLS exigen un rol, así que esta persona no
 * puede leer ni escribir nada. Es el estado correcto para una cuenta recién
 * registrada: en un sistema BPF, tener credencial y tener atribución son dos
 * cosas distintas, y la segunda la otorga alguien.
 */
export function PantallaSinHabilitar() {
  const { salir, refrescar, session } = useSesion();

  return (
    <Box
      style={{
        minHeight: '100dvh',
        background: 'var(--app-fondo)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Stack gap="lg" w="100%" maw={460} className="entrada">
        <Center>
          <Marca size={88} />
        </Center>

        <Paper
          p="xl"
          withBorder
          shadow="sm"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Stack gap="md">
            <Group gap="sm">
              <IconClockPause size={26} color="var(--mantine-color-azul-text)" />
              <Title order={2}>Cuenta pendiente de habilitación</Title>
            </Group>

            <Text size="sm" c="dimmed">
              Tu cuenta existe pero todavía no tiene rol asignado, así que no puede ver ni
              cargar registros. Pedile al administrador del sistema que te habilite y te
              asigne el rol que corresponde a tu puesto.
            </Text>

            <Text size="sm" c="dimmed">
              Cuando te habiliten, actualizá los permisos: el rol viaja en la credencial y
              recién se aplica cuando ésta se renueva.
            </Text>

            <Paper withBorder p="sm" bg="var(--superficie-tenue)">
              <Text size="xs" c="dimmed">
                Correo de la cuenta
              </Text>
              <Text size="sm" fw={600}>
                {session?.user.email}
              </Text>
            </Paper>

            <Group grow>
              <Button
                variant="light"
                leftSection={<IconRefresh size={18} />}
                onClick={() => void refrescar()}
              >
                Actualizar permisos
              </Button>
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconLogout size={18} />}
                onClick={() => void salir()}
              >
                Salir
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
