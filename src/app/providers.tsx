import { type ReactNode, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './theme';
import { ProveedorSesion } from '@/features/auth/sesion';

/**
 * Proveedores de la aplicación.
 *
 * Orden: Mantine por fuera (los modales y notificaciones necesitan su contexto
 * de tema), después la sesión, después React Query, y el Router por dentro.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /*
             * Sin refetch automático al volver a la ventana. En planta la
             * tablet pierde y recupera foco todo el tiempo, y un refresco a
             * mitad de carga de un registro haría perder lo tipeado.
             */
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" limit={3} />
      <ModalsProvider>
        <ProveedorSesion>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>{children}</BrowserRouter>
          </QueryClientProvider>
        </ProveedorSesion>
      </ModalsProvider>
    </MantineProvider>
  );
}
