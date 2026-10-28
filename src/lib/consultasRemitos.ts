/**
 * Remitos de producto terminado (D-remito-1, 20261028150000): interno «X» por
 * ahora, con lugar para el «R» con CAI.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito } from './consultas';

/* Las tablas entran en los tipos cuando se regeneren con 20261028150000. */
const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');

/** Datos fijos de la empresa en el remito (pedido del 2026-10-28). */
export const EMPRESA = { nombre: 'Nailshow', cuit: '30-54667116-6' };

export interface Remito {
  id: string;
  letra: 'X' | 'R';
  punto_venta: number;
  numero: number;
  fecha: string;
  motivo: 'TRANSFERENCIA' | 'SALIDA';
  receptor_nombre: string;
  receptor_cuit: string | null;
  receptor_domicilio: string | null;
  receptor_iva: string | null;
  entrega_domicilio: string | null;
  transporte: string | null;
  observaciones: string | null;
  cai: string | null;
  cai_vencimiento: string | null;
  confeccionado_por: string;
}

export interface RenglonRemito {
  producto_id: string | null;
  codigo: string | null;
  descripcion: string;
  bultos: number | null;
  cantidad: number;
  observaciones: string | null;
}

/** «0001-00000012»: punto de venta de 4 cifras y número de 8, como se usa. */
export function numeroRemito(puntoVenta: number, numero: number) {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`;
}

/** Nombre del archivo: «Remito X 0001-00000012 ORIGINAL». */
export function nombreArchivoRemito(
  r: Pick<Remito, 'letra' | 'punto_venta' | 'numero'>,
  copia: boolean,
) {
  return `Remito ${r.letra} ${numeroRemito(r.punto_venta, r.numero)} ${copia ? 'COPIA' : 'ORIGINAL'}`;
}

export function useEmitirRemito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      remito: Partial<Remito> & {
        motivo: Remito['motivo'];
        receptor_nombre: string;
        deposito_origen_id: string | null;
      };
      renglones: RenglonRemito[];
    }) => {
      const { data, error } = await comercialST()
        .rpc('emitir_remito', { p_remito: a.remito, p_renglones: a.renglones })
        .single();
      if (error) throw error;
      return data as Remito;
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['remitos'] });
      avisarExito(`Remito ${numeroRemito(r.punto_venta, r.numero)} emitido.`);
    },
    onError: avisarError,
  });
}

/** Los últimos remitos de un depósito, para reimprimir. */
export function useRemitos(depositoId: string | undefined) {
  return useQuery({
    queryKey: ['remitos', depositoId],
    enabled: Boolean(depositoId),
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('remitos')
        .select(
          '*, renglones:remito_renglones(producto_id, codigo, descripcion, bultos, cantidad, observaciones, orden)',
        )
        .eq('deposito_origen_id', depositoId!)
        .order('creado_en', { ascending: false })
        .limit(30);
      if (error) throw error;
      const filas = (data ?? []) as (Remito & {
        renglones: (RenglonRemito & { orden: number })[];
      })[];
      return filas.map((r) => ({
        ...r,
        renglones: r.renglones.slice().sort((a, b) => a.orden - b.orden),
      }));
    },
  });
}
