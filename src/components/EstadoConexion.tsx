import { Badge, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Indicador de conexión con Supabase.
 *
 * Existe por una razón concreta del andamiaje: sin ningún consumidor real,
 * `lib/supabase.ts` queda fuera del grafo de módulos, Vite lo elimina por
 * tree-shaking y las variables `VITE_*` nunca entran al bundle. El resultado es
 * que una configuración de entorno rota no se descubre hasta la primera
 * pantalla que consulte datos. Este componente cierra la cadena completa:
 * `.env` -> validación de `lib/env.ts` -> cliente -> red.
 *
 * Nota de color: NO usa la paleta de estados de rótulo. Amarillo, gris, verde y
 * rojo están reservados a los cuatro estados de I.20.2 (ver `app/theme.ts`).
 * Un verde acá competiría con el verde que significa «lote aprobado», que es
 * exactamente la señal que no hay que degradar.
 */
export function EstadoConexion() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['conexion-supabase'],
    queryFn: async () => {
      const { error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
      return { conectado: true } as const;
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <Badge color="gray" variant="light">
        Verificando conexión…
      </Badge>
    );
  }

  return (
    <Group gap="xs">
      <Badge color={isError ? 'dark' : 'interfaz'} variant="filled">
        {isError ? 'Sin conexión' : 'Conectado'}
      </Badge>
      {data ? (
        <Text size="xs" c="dimmed">
          {new URL(import.meta.env.VITE_SUPABASE_URL).hostname}
        </Text>
      ) : null}
    </Group>
  );
}
