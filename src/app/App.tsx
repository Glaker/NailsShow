import { Center, Loader } from '@mantine/core';
import { Providers } from './providers';
import { Layout } from './layout';
import { AppRoutes } from './routes';
import { useSesion } from '@/features/auth/sesion';
import { PantallaIngreso } from '@/features/auth/PantallaIngreso';
import { PantallaSinHabilitar } from '@/features/auth/PantallaSinHabilitar';

/**
 * Puerta de la aplicación.
 *
 * Tres estados antes de mostrar nada: sin sesión, con sesión y sin rol, o
 * adentro. La interfaz oculta lo que el rol no puede hacer, pero la autoridad
 * sigue siendo RLS: esta puerta evita una pantalla vacía sin explicación, no
 * reemplaza al control (CLAUDE.md §6).
 */
function Puerta() {
  const { cargando, session, sinHabilitar } = useSesion();

  if (cargando) {
    return (
      <Center h="100dvh">
        <Loader color="violeta" />
      </Center>
    );
  }

  if (!session) return <PantallaIngreso />;
  if (sinHabilitar) return <PantallaSinHabilitar />;

  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}

export function App() {
  return (
    <Providers>
      <Puerta />
    </Providers>
  );
}
