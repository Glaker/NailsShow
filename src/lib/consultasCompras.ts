/**
 * Comprobantes de proveedor: la recepción fiscal (RN-65, 20260929100000).
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { comercial } from './supabase';

export type TipoComprobanteProveedor =
  Database['comercial']['Enums']['tipo_comprobante_proveedor_enum'];

export type ComprobanteProveedorRow =
  Database['comercial']['Tables']['comprobantes_proveedor']['Row'];

export type NuevoComprobanteProveedor = Pick<
  ComprobanteProveedorRow,
  'proveedor_id' | 'tipo'
> &
  Partial<
    Pick<
      ComprobanteProveedorRow,
      | 'recepcion_id'
      | 'punto_venta'
      | 'numero'
      | 'fecha'
      | 'vencimiento_pago'
      | 'importe_neto'
      | 'importe_iva'
      | 'importe_otros'
      | 'importe_total'
      | 'comprobante_asociado_id'
      | 'observacion'
    >
  >;

export const ETIQUETA_COMPROBANTE: Record<TipoComprobanteProveedor, string> = {
  FACTURA_A: 'Factura A',
  FACTURA_B: 'Factura B',
  FACTURA_C: 'Factura C',
  NOTA_CREDITO_A: 'Nota de crédito A',
  NOTA_CREDITO_B: 'Nota de crédito B',
  NOTA_CREDITO_C: 'Nota de crédito C',
  SIN_FACTURA: 'Sin factura',
};

/** Solo las clases A discriminan IVA: es el crédito fiscal. */
export const discriminaIva = (t: TipoComprobanteProveedor) => t.endsWith('_A');

/** «0003-00001234», o «solo remito». */
export function numeroComprobante(
  c: Pick<ComprobanteProveedorRow, 'punto_venta' | 'numero'>,
) {
  if (c.punto_venta === null || c.numero === null) return 'solo remito';
  return `${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`;
}

/** Quién carga comprobantes: `comprobantes_proveedor_insert_carga`. */
export const ROLES_CARGAN_COMPROBANTES = [
  'ADMINISTRACION',
  'GERENCIA',
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
  'OPERARIO',
  'CONTROL_CALIDAD',
] as const;

/** Quién anula: `comprobantes_proveedor_update_administracion`. */
export const ROLES_ANULAN_COMPROBANTES = [
  'ADMINISTRACION',
  'GERENCIA',
  'GERENCIA_PRODUCCION',
] as const;

export function useComprobantesProveedor(filtro: { proveedorId?: string } = {}) {
  return useQuery({
    queryKey: ['comprobantes-proveedor', filtro.proveedorId ?? null],
    queryFn: async () => {
      let consulta = comercial()
        .from('comprobantes_proveedor')
        .select('*')
        .order('fecha', { ascending: false });
      if (filtro.proveedorId) consulta = consulta.eq('proveedor_id', filtro.proveedorId);
      const { data, error } = await consulta;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegistrarComprobanteProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: NuevoComprobanteProveedor) => {
      const { error } = await comercial().from('comprobantes_proveedor').insert(c);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comprobantes-proveedor'] });
    },
    onError: avisarError,
  });
}

export function useAnularComprobanteProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; motivo: string }) => {
      const { error } = await comercial().rpc('anular_comprobante_proveedor', {
        p_id: a.id,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comprobantes-proveedor'] });
      avisarExito('Comprobante anulado. Cargá el correcto si corresponde.');
    },
    onError: avisarError,
  });
}
