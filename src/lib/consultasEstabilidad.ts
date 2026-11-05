/**
 * Estudios de estabilidad acelerada (D-estabilidad-1, 20261105120000).
 * La DT escribe; cerrado, la base rechaza todo cambio (invariante 1).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError } from './consultas';
import { gmp } from './supabase';

type T = Database['gmp']['Tables'];
export type Estudio = T['estudios_estabilidad']['Row'];
export type Parametro = T['estabilidad_parametros']['Row'];

/** Columnas de resultado, en orden. */
export const TIEMPOS = [
  { col: 'inicial', etiqueta: 'Inicial', dias: 0 },
  { col: 'dia_30', etiqueta: '30 días', dias: 30 },
  { col: 'dia_60', etiqueta: '60 días', dias: 60 },
  { col: 'dia_90', etiqueta: '90 días', dias: 90 },
] as const;

/** Lo que se precarga al abrir un estudio; la DT lo cambia o agrega. */
export const PARAMETROS_SUGERIDOS = ['Aspecto', 'Color', 'Olor', 'pH', 'Función'];

export function useEstudios() {
  return useQuery({
    queryKey: ['estabilidad'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('estudios_estabilidad')
        .select('*')
        .order('fecha_inicio', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEstudio(id: string | undefined) {
  return useQuery({
    queryKey: ['estabilidad', id],
    enabled: !!id,
    queryFn: async () => {
      const [e, p] = await Promise.all([
        gmp().from('estudios_estabilidad').select('*').eq('id', id!).single(),
        gmp()
          .from('estabilidad_parametros')
          .select('*')
          .eq('estudio_id', id!)
          .eq('quitado', false)
          .order('orden')
          .order('creado_en'),
      ]);
      if (e.error) throw e.error;
      if (p.error) throw p.error;
      return { estudio: e.data, parametros: p.data };
    },
  });
}

export function useCrearEstudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T['estudios_estabilidad']['Insert']) => {
      const { data, error } = await gmp()
        .from('estudios_estabilidad')
        .insert(v)
        .select('id')
        .single();
      if (error) throw error;
      const { error: e2 } = await gmp()
        .from('estabilidad_parametros')
        .insert(
          PARAMETROS_SUGERIDOS.map((parametro, orden) => ({
            estudio_id: data.id,
            parametro,
            orden,
          })),
        );
      if (e2) throw e2;
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['estabilidad'] }),
    onError: avisarError,
  });
}

export function useEditarEstudio(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T['estudios_estabilidad']['Update']) => {
      const { error } = await gmp().from('estudios_estabilidad').update(v).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['estabilidad'] }),
    onError: avisarError,
  });
}

export function useAgregarParametro(estudioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { parametro: string; orden: number }) => {
      const { error } = await gmp()
        .from('estabilidad_parametros')
        .insert({ estudio_id: estudioId, ...v });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['estabilidad', estudioId] }),
    onError: avisarError,
  });
}

export function useEditarParametro(estudioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...v
    }: T['estabilidad_parametros']['Update'] & { id: string }) => {
      const { error } = await gmp().from('estabilidad_parametros').update(v).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['estabilidad', estudioId] }),
    onError: avisarError,
  });
}
