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
        background:
          'radial-gradient(1100px 600px at 15% -10%, #3a2447 0%, #1a0e22 55%, #14091b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Stack gap="lg" w="100%" maw={460} className="entrada">
        <Center>
          <Marca size={44} />
        </Center>

        <Paper p="xl" radius="lg" shadow="xl">
          <Stack gap="md">
            <Group gap="sm">
              <IconClockPause size={26} color="var(--mantine-color-violeta-7)" />
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

            <Paper withBorder p="sm" radius="md" bg="violeta.0">
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
