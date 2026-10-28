/**
 * Productos hermanos (D-hermanos-1, 20261028130000): los que se envasan del
 * mismo granel. Una orden de uno da unidades de todos, con el mismo lote.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito } from './consultas';

const gmpST = () => (supabase as unknown as SupabaseClient).schema('gmp');
const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');

export interface ConFamilia {
  id: string;
  nombre: string;
  codigo_interno: string;
  familia_granel?: string | null;
}

/** Los hermanos de un producto, sin él. */
export function hermanosDe<T extends ConFamilia>(productos: T[], id: string | null): T[] {
  const familia = productos.find((p) => p.id === id)?.familia_granel;
  if (!familia) return [];
  return productos.filter((p) => p.familia_granel === familia && p.id !== id);
}

/** Lo que se manda a terminar_orden: solo los que tienen unidades. */
export function repartoDe(cantidades: Record<string, number | string>) {
  return Object.entries(cantidades)
    .map(([producto_id, u]) => ({ producto_id, unidades: Number(u || 0) }))
    .filter((r) => r.unidades > 0);
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    'productos',
    'stock-pt-lotes',
    'stock-punto-venta',
    'movimientos-pt',
    'disponible-pt',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
}

export function useVincularHermano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { productoId: string; hermanoId: string }) => {
      const { error } = await gmpST().rpc('vincular_hermano', {
        p_producto_id: a.productoId,
        p_hermano_id: a.hermanoId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useDesvincularHermano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productoId: string) => {
      const { error } = await gmpST().rpc('desvincular_hermano', {
        p_producto_id: productoId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

/** Depósitos de producto terminado donde se corrige el reparto. */
export type DepositoHermanos = 'PTF' | 'C5' | 'BER';

/**
 * Cuántas de cada hermano hay en un depósito, de un lote o (ordenId null) sin
 * lote (20261028170000).
 */
export function useStockFamilia(
  deposito: DepositoHermanos,
  ordenId: string | null,
  familia: string[],
  habilitado: boolean,
) {
  return useQuery({
    queryKey: ['stock-pt-lotes', 'familia', deposito, ordenId, familia],
    enabled: habilitado,
    queryFn: async () => {
      const base = comercialST()
        .from('v_stock_pt_lotes')
        .select('producto_id, saldo')
        .eq('deposito_numero', deposito)
        .in('producto_id', familia);
      const { data, error } = await (ordenId ? base.eq('orden_id', ordenId) : base.is('orden_id', null));
      if (error) throw error;
      const filas: { producto_id: string; saldo: number }[] = data ?? [];
      return filas;
    },
  });
}

export function useRepartirLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      deposito: DepositoHermanos;
      ordenId: string | null;
      reparto: { producto_id: string; unidades: number }[];
      motivo: string;
    }) => {
      const { error } = await comercialST().rpc('repartir_stock_hermanos', {
        p_deposito: a.deposito,
        p_orden_id: a.ordenId,
        p_reparto: a.reparto,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Reparto entre hermanos corregido en el stock.');
    },
    onError: avisarError,
  });
}
