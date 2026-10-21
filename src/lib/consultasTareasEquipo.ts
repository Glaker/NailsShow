/**
 * «Tareas»: matriz de Eisenhower del equipo (20261014190000). pos_x es la
 * urgencia (0 = urgente), pos_y la importancia (0 = importante).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError } from './consultas';
import { comercial } from './supabase';

export type TareaEquipo = Database['comercial']['Tables']['tareas_equipo']['Row'];

const CLAVE = ['tareas-equipo'];

export function useTareasEquipo(habilitado: boolean) {
  return useQuery({
    queryKey: CLAVE,
    enabled: habilitado,
    refetchInterval: 20_000, // ponytail: sondeo; tiempo real si hace falta ver mover en vivo
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('tareas_equipo')
        .select('*')
        .eq('archivada', false)
        .is('hecha_en', null)
        .order('creada_en');
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        pos_x: Number(t.pos_x),
        pos_y: Number(t.pos_y),
      }));
    },
  });
}

export function useCrearTareaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      titulo: string;
      detalle: string | null;
      compartida: boolean;
      pos_x: number;
      pos_y: number;
    }) => {
      const { error } = await comercial().from('tareas_equipo').insert(t);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}

/** Mover un pin: se ve al instante y se guarda atrás. */
export function useMoverTareaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id: string; pos_x: number; pos_y: number }) => {
      const { error } = await comercial()
        .from('tareas_equipo')
        .update({ pos_x: m.pos_x, pos_y: m.pos_y })
        .eq('id', m.id);
      if (error) throw error;
    },
    onMutate: (m) => {
      qc.setQueryData<TareaEquipo[]>(CLAVE, (prev) =>
        prev?.map((t) => (t.id === m.id ? { ...t, pos_x: m.pos_x, pos_y: m.pos_y } : t)),
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}

/**
 * Cambiar el texto o la visibilidad: solo quien la cargó (lo hace cumplir
 * comercial.fn_tarea_equipo, 20261014190000).
 */
export function useEditarTareaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: {
      id: string;
      titulo: string;
      detalle: string | null;
      compartida: boolean;
    }) => {
      const { error } = await comercial()
        .from('tareas_equipo')
        .update({ titulo: e.titulo, detalle: e.detalle, compartida: e.compartida })
        .eq('id', e.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}

/** Hecha (cualquiera) o archivada (quien la cargó): sale de la matriz. */
export function useCerrarTareaEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id: string; como: 'hecha' | 'archivada' }) => {
      const { error } = await comercial()
        .from('tareas_equipo')
        .update(
          c.como === 'hecha'
            ? { hecha_en: new Date().toISOString() }
            : { archivada: true },
        )
        .eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}
