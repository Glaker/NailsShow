/**
 * Envase etiquetado y tareas pendientes de carga (20261021120000,
 * D-etiquetado-1).
 *
 * Puente sin tipos hasta regenerar database.types.ts con la migración
 * aplicada: los tipos de acá son el espejo de las vistas, no se inventan.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito, invalidarStock } from './consultas';

const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');
const gmpST = () => (supabase as unknown as SupabaseClient).schema('gmp');

export interface FaltaEtiquetar {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  pendientes: number;
  en_stock: number;
  faltan: number;
  etiquetados_hoy: number;
  definido: boolean;
}

export interface TareaCarga {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  sin_formula: boolean;
  envase_id: string | null;
  etiqueta_id: string | null;
  extras: number;
  tiene_formula: boolean;
  pendientes: number;
}

export type RolMaterial = 'ENVASE' | 'ETIQUETA' | 'EXTRA';

export function useFaltanEtiquetar() {
  return useQuery({
    queryKey: ['etiquetado', 'faltan'],
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_faltan_etiquetar')
        .select('*')
        .order('faltan', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as FaltaEtiquetar[];
    },
  });
}

export function useRegistrarEtiquetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { productoId: string; cantidad: number }) => {
      const { error } = await comercialST().rpc('registrar_etiquetado', {
        p_producto_id: e.productoId,
        p_cantidad: e.cantidad,
      });
      if (error) throw error;
    },
    onSuccess: (_, e) => {
      void qc.invalidateQueries({ queryKey: ['etiquetado'] });
      invalidarStock(qc);
      avisarExito(`${e.cantidad} etiquetados: se descontaron envases y etiquetas.`);
    },
    onError: avisarError,
  });
}

/** Etiquetados de hoy de un producto que se pueden anular (ningún pedido los usó). */
export function useEtiquetadosAnulables(productoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['etiquetado', 'anulables', productoId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_etiquetados_saldo')
        .select('etiquetado_id, cantidad, saldo, registrado_en')
        .eq('producto_id', productoId)
        .eq('anulado', false)
        .order('registrado_en', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (
        (data ?? []) as {
          etiquetado_id: string;
          cantidad: number;
          saldo: number;
          registrado_en: string;
        }[]
      ).filter((e) => Number(e.saldo) === Number(e.cantidad));
    },
  });
}

/** Anula un etiquetado mal cargado: devuelve envase y etiqueta (RN-54). */
export function useAnularEtiquetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { etiquetadoId: string; motivo: string }) => {
      const { error } = await comercialST().rpc('anular_etiquetado', {
        p_etiquetado_id: a.etiquetadoId,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['etiquetado'] });
      invalidarStock(qc);
      avisarExito('Etiquetado anulado: volvieron el envase y la etiqueta.');
    },
    onError: avisarError,
  });
}

export function useTareasCarga() {
  return useQuery({
    queryKey: ['etiquetado', 'tareas'],
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_tareas_carga')
        .select('*')
        .order('pendientes', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as TareaCarga[];
    },
  });
}

function invalidarCarga(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['etiquetado', 'materiales', 'productos', 'formulas'])
    void qc.invalidateQueries({ queryKey: [k] });
}

/**
 * Asigna el envase, la etiqueta o un extra de un producto. Envase y etiqueta
 * son uno por producto: el anterior se da de baja (no se borra). La fila
 * (producto, insumo) es única en la base, así que si ya existía se reactiva.
 */
export function useAsignarMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { productoId: string; insumoId: string; rol: RolMaterial }) => {
      const tabla = () => gmpST().from('materiales_acondicionamiento');
      if (m.rol !== 'EXTRA') {
        const { error } = await tabla()
          .update({ activo: false })
          .eq('producto_id', m.productoId)
          .eq('rol', m.rol)
          .eq('activo', true)
          .neq('insumo_id', m.insumoId);
        if (error) throw error;
      }
      const { data: existe, error: e1 } = await tabla()
        .select('producto_id')
        .eq('producto_id', m.productoId)
        .eq('insumo_id', m.insumoId)
        .maybeSingle();
      if (e1) throw e1;
      const { error } = existe
        ? await tabla()
            .update({ rol: m.rol, activo: true })
            .eq('producto_id', m.productoId)
            .eq('insumo_id', m.insumoId)
        : await tabla().insert({
            producto_id: m.productoId,
            insumo_id: m.insumoId,
            cantidad_por_unidad: 1,
            rol: m.rol,
          });
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}

export function useQuitarExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { productoId: string; insumoId: string }) => {
      const { error } = await gmpST()
        .from('materiales_acondicionamiento')
        .update({ activo: false })
        .eq('producto_id', m.productoId)
        .eq('insumo_id', m.insumoId);
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}

/** Extras vigentes de un producto (lo que no es envase ni etiqueta). */
export function useExtrasDeProducto(productoId: string) {
  return useQuery({
    queryKey: ['materiales', 'extras', productoId],
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('materiales_acondicionamiento')
        .select('insumo_id, insumo:insumos_catalogo(nombre, codigo_interno)')
        .eq('producto_id', productoId)
        .eq('activo', true)
        .eq('rol', 'EXTRA');
      if (error) throw error;
      return (data ?? []) as unknown as {
        insumo_id: string;
        insumo: { nombre: string; codigo_interno: string } | null;
      }[];
    },
  });
}

/** «No corresponde»: el producto no lleva fórmula. */
export function useMarcarSinFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { productoId: string; sinFormula: boolean }) => {
      const { error } = await gmpST()
        .from('productos')
        .update({ sin_formula: p.sinFormula })
        .eq('id', p.productoId);
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}
