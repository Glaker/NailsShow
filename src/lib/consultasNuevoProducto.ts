/**
 * Nuevo producto con Gerencia de Producción cargando y Dirección Técnica
 * aprobando (20261023120000, D-nuevo-producto-1): aprobación de
 * procedimientos, «No la sé» y copiar de otro producto.
 *
 * Puente sin tipos hasta regenerar database.types.ts con la migración
 * aplicada: los tipos de acá son el espejo de las tablas y vistas.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito } from './consultas';

const gmpST = () => (supabase as unknown as SupabaseClient).schema('gmp');

export type SeccionDT = 'FORMULA' | 'PROCEDIMIENTO' | 'ESPECIFICACION';

export interface PendienteDT {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  seccion: SeccionDT;
  /** NO_LA_SABE: lo pidió GP. A_APROBAR: lo cargó y espera a DT. */
  motivo: 'NO_LA_SABE' | 'A_APROBAR';
  desde: string;
  pedido_por: string | null;
}

/** Lo que Dirección Técnica tiene que cargar o aprobar. */
export function usePendientesDT(habilitado = true) {
  return useQuery({
    queryKey: ['pendientes-dt'],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('v_pendientes_dt')
        .select('*')
        .order('desde', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendienteDT[];
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    'pendientes-dt',
    'consultas-dt',
    'procedimientos',
    'procedimientos-vigentes',
    'formulas-fabricacion',
    'especificaciones',
    'productos',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
}

/** Qué secciones del producto ya se derivaron a DT. */
export function useConsultasDT(productoId: string | null) {
  return useQuery({
    queryKey: ['consultas-dt', productoId],
    enabled: Boolean(productoId),
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('consultas_dt')
        .select('seccion')
        .eq('producto_id', productoId!);
      if (error) throw error;
      return new Set((data ?? []).map((c: { seccion: SeccionDT }) => c.seccion));
    },
  });
}

/** «No la sé» del procedimiento o la especificación: lo carga DT. */
export function useConsultarDT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      productoId: string;
      seccion: 'PROCEDIMIENTO' | 'ESPECIFICACION';
    }) => {
      const { error } = await gmpST()
        .from('consultas_dt')
        .insert({ producto_id: c.productoId, seccion: c.seccion });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Se lo pasaste a Dirección Técnica.');
    },
    onError: avisarError,
  });
}

/** Aprobar el procedimiento que redactó GP: desde ahí rige. */
export function useAprobarProcedimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (procedimientoId: string) => {
      const { error } = await gmpST()
        .from('procedimiento_aprobaciones')
        .insert({ procedimiento_id: procedimientoId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Procedimiento aprobado: es el que rige.');
    },
    onError: avisarError,
  });
}

export interface ProcedimientoVigente {
  formula_id: string;
  texto: string;
  version: number;
}

/** Procedimientos que rigen, para copiar uno de otro producto. */
export function useProcedimientosVigentes(habilitado: boolean) {
  return useQuery({
    queryKey: ['procedimientos-vigentes'],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await gmpST().from('v_procedimiento_vigente').select('*');
      if (error) throw error;
      return (data ?? []) as ProcedimientoVigente[];
    },
  });
}

/** La fórmula de otro producto como borrador nuevo de este. */
export function useCopiarFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { origen: string; productoId: string }) => {
      const r = await gmpST().rpc('copiar_formula', {
        p_origen: c.origen,
        p_producto_id: c.productoId,
      });
      if (r.error) throw r.error;
      return String(r.data);
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Fórmula copiada como borrador: revisala y ajustala.');
    },
    onError: avisarError,
  });
}

/** La especificación de otro producto como borrador 00 de este. */
export function useCopiarEspecificacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { origen: string; productoId: string; codigoPoe: string }) => {
      const r = await gmpST().rpc('copiar_especificacion', {
        p_origen: c.origen,
        p_producto_id: c.productoId,
        p_codigo_poe: c.codigoPoe,
      });
      if (r.error) throw r.error;
      return String(r.data);
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Especificación copiada como borrador: revisala y ajustala.');
    },
    onError: avisarError,
  });
}

/** Pega en un borrador los componentes de otra fórmula (D-nuevo-producto-2). */
export function useCopiarComponentes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      origen: string;
      destino: string;
      procedimiento: boolean;
    }) => {
      const r = await gmpST().rpc('copiar_componentes', {
        p_origen: c.origen,
        p_destino: c.destino,
      });
      if (r.error) throw r.error;
      if (c.procedimiento) {
        const p = await gmpST().rpc('copiar_procedimiento', {
          p_origen: c.origen,
          p_destino: c.destino,
        });
        if (p.error) throw p.error;
      }
      return Number(r.data);
    },
    onSuccess: (n) => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['formula-completa'] });
      avisarExito(`Se pegaron ${n} componentes. Revisalos y ajustá lo que haga falta.`);
    },
    onError: avisarError,
  });
}

