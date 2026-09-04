import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Cliente Supabase del navegador.
 *
 * Usa exclusivamente la clave anónima. Toda autoridad de acceso vive en las
 * políticas RLS de la base, nunca en este archivo (CLAUDE.md §6, frontend).
 *
 * Fase 1 va a tipar este cliente con `Database` de `./database.types`, generado
 * por `npm run db:types`. Ese archivo todavía no existe porque los esquemas se
 * crean en la fase 1.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
