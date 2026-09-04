import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

/**
 * Cliente Supabase del navegador.
 *
 * Usa exclusivamente la clave pública. Toda autoridad de acceso vive en las
 * políticas RLS de la base, nunca en este archivo (CLAUDE.md §6, frontend).
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
);

/**
 * Atajos por esquema.
 *
 * El cliente tipado apunta a `public` por defecto, y este sistema no tiene
 * nada en `public`: todo vive en `core`, `gmp` y `comercial`. Nombrar el
 * esquema en cada consulta obliga a tener presente de qué dominio se está
 * leyendo, que es justo lo que la invariante 7 de CLAUDE.md pide no perder de
 * vista.
 */
export const core = () => supabase.schema('core');
export const gmp = () => supabase.schema('gmp');
