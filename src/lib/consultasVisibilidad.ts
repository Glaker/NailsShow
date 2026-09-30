/**
 * Visibilidad de pantallas por rol (20260929170000). Solo menú: la autoridad
 * sobre los datos es RLS (CLAUDE.md §6).
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Rol } from '@/features/auth/sesion';
import type { Database } from './database.types';
import { avisarError } from './consultas';
import { core } from './supabase';

export type VisibilidadRow = Pick<
  Database['core']['Tables']['visibilidad_pantallas']['Row'],
  'pantalla' | 'rol' | 'visible' | 'motivo' | 'cambiado_en'
>;

/** Excepciones cargadas. Si la tabla todavía no existe, no hay excepciones. */
export function useVisibilidad() {
  return useQuery({
    queryKey: ['visibilidad-pantallas'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await core()
        .from('visibilidad_pantallas')
        .select('pantalla, rol, visible, motivo, cambiado_en');
      if (error) return [];
      return data ?? [];
    },
  });
}

export function useFijarVisibilidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { pantalla: string; rol: Rol; visible: boolean }) => {
      const { error } = await core().rpc('fijar_visibilidad', {
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
