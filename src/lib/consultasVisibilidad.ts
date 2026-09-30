/**
 * Visibilidad de pantallas por rol (20260929170000). Solo menú: la autoridad
 * sobre los datos es RLS (CLAUDE.md §6).
 *
 * PUENTE DE TIPOS hasta aplicar la migración y correr `npm run db:types`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Rol } from '@/features/auth/sesion';
import { avisarError, type ConsultaTabla } from './consultas';
import { core } from './supabase';

export interface VisibilidadRow {
  pantalla: string;
  rol: Rol;
  visible: boolean;
  motivo: string | null;
  cambiado_en: string;
}

function tablaCore<T>(nombre: string): ConsultaTabla<T> {
  const cliente = core();
  const desde = cliente.from.bind(cliente) as unknown as (tabla: string) => unknown;
  return desde(nombre) as ConsultaTabla<T>;
}

/** Excepciones cargadas. Si la tabla todavía no existe, no hay excepciones. */
export function useVisibilidad() {
  return useQuery({
    queryKey: ['visibilidad-pantallas'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await tablaCore<VisibilidadRow[]>(
        'visibilidad_pantallas',
      ).select('pantalla, rol, visible, motivo, cambiado_en');
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useFijarVisibilidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { pantalla: string; rol: Rol; visible: boolean }) => {
      const cliente = core();
      const rpc = cliente.rpc.bind(cliente) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: Error | null }>;
      const { error } = await rpc('fijar_visibilidad', {
        p_pantalla: v.pantalla,
        p_rol: v.rol,
        p_visible: v.visible,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['visibilidad-pantallas'] }),
    onError: avisarError,
  });
}
