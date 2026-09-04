import { z } from 'zod';

/**
 * Variables de entorno del cliente.
 *
 * Solo entran acá variables con prefijo `VITE_`, que Vite inyecta en el bundle
 * y por lo tanto son públicas por construcción. La clave de servicio no se
 * lee nunca desde el cliente: tiene BYPASSRLS y su presencia en el bundle haría
 * que ningún registro del sistema pruebe nada (CLAUDE.md §5, invariante 4).
 * `scripts/check-service-role.sh` lo verifica de forma mecánica en CI.
 */
const esquemaEnv = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL debe ser una URL válida'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'Falta VITE_SUPABASE_ANON_KEY'),
});

const parseado = esquemaEnv.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

if (!parseado.success) {
  throw new Error(
    `Configuración de entorno inválida. Revisá .env contra .env.example:\n${parseado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')}`,
  );
}

export const env = parseado.data;
