/**
 * Registros de análisis R.50.5.1 (insumo), R.50.6.1 (semielaborado) y
 * R.50.10.1 (granel), 20261014170000. Dictaminar es un solo paso: registro y
 * cambio de estado en la misma transacción de la base.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { gmp } from './supabase';

export type RegistroAnalisis = Database['gmp']['Views']['v_registros_analisis']['Row'];
export type AnalisisPendiente = Database['gmp']['Views']['v_analisis_pendientes']['Row'];

export interface DatosAnalisis {
  tamano: string;
  descripcion: string;
  conclusiones: string;
  aprobado: boolean;
}

/** Registros de un lote de insumo o de una orden (granel), vigentes primero. */
export function useRegistrosAnalisis(filtro: {
  loteId?: string | undefined;
  ordenId?: string | undefined;
}) {
  return useQuery({
    queryKey: ['analisis', filtro.loteId ?? null, filtro.ordenId ?? null],
    enabled: Boolean(filtro.loteId ?? filtro.ordenId),
    queryFn: async () => {
      let q = gmp().from('v_registros_analisis').select('*');
      q = filtro.loteId
        ? q.eq('lote_insumo_id', filtro.loteId)
        : q.eq('orden_id', filtro.ordenId!);
      const { data, error } = await q.order('controlo_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Todos los registros vigentes de lotes de insumo, por número interno de lote. */
export function useAnalisisPorLoteInterno() {
  return useQuery({
    queryKey: ['analisis', 'por-lote'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_registros_analisis')
        .select('*')
        .eq('vigente', true)
        .not('lote_insumo_id', 'is', null);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.lote_interno ?? '', r]));
    },
  });
}

export function useAnalisisPendientes() {
  return useQuery({
    queryKey: ['analisis', 'pendientes'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_analisis_pendientes')
        .select('*')
        .order('desde');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    'analisis',
    'lotes',
    'lote',
    'rotulos',
    'tablero',
    'lotes-por-estado',
    'orden',
    'ordenes',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
}

/** Lote de insumo o semielaborado: registro + APROBADO/RECHAZADO con rótulo. */
export function useDictaminarLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ loteId, ...d }: DatosAnalisis & { loteId: string }) => {
      const { error } = await gmp().rpc('dictaminar_lote_insumo', {
        p_lote_id: loteId,
        p_tamano: d.tamano,
        p_descripcion: d.descripcion,
        p_conclusiones: d.conclusiones,
        p_aprobado: d.aprobado,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      invalidar(qc);
      avisarExito(
        v.aprobado
          ? 'Análisis registrado y lote aprobado.'
          : 'Análisis registrado y lote rechazado.',
      );
    },
    onError: avisarError,
  });
}

/** Granel: R.50.10.1 y etapa CC_GRANEL con ese dictamen. */
export function useDictaminarGranel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ordenId,
      rectificaA,
      motivo,
      ...d
    }: DatosAnalisis & {
      ordenId: string;
      rectificaA?: string | null;
      motivo?: string | null;
    }) => {
      const { error } = await gmp().rpc('dictaminar_granel', {
        p_orden_id: ordenId,
        p_tamano: d.tamano,
        p_descripcion: d.descripcion,
        p_conclusiones: d.conclusiones,
        p_aprobado: d.aprobado,
        ...(rectificaA ? { p_rectifica_a: rectificaA, p_motivo: motivo ?? '' } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Análisis del granel registrado.');
    },
    onError: avisarError,
  });
}
