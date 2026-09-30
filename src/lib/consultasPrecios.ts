/**
 * Precios de lista y descuentos por cliente (20260929150000).
 *
 * PUENTE DE TIPOS hasta aplicar la migración y correr `npm run db:types`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avisarError, avisarExito } from './consultas';
import { rpcComercial, tablaComercial } from './consultasComercial';

/** Quién cambia precios y descuentos: las políticas de insert. */
export const ROLES_PRECIOS = ['VENTAS', 'ADMINISTRACION', 'GERENCIA'] as const;

export interface PrecioVigente {
  producto_id: string;
  codigo_interno: string;
  producto: string;
  precio_lista: number;
  alicuota_iva: number;
  precio_neto: number;
  vigente_desde: string;
  origen: string | null;
  motivo: string | null;
}

export interface DescuentoVigente {
  cliente_id: string;
  cliente: string;
  producto_id: string | null;
  codigo_interno: string | null;
  producto: string | null;
  porcentaje: number;
  motivo: string | null;
  vigente_desde: string;
}

export function usePreciosVigentes() {
  return useQuery({
    queryKey: ['precios-vigentes'],
    queryFn: async () => {
      const { data, error } = await tablaComercial<PrecioVigente[]>('v_precios_vigentes')
        .select('*')
        .order('producto', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDescuentosVigentes() {
  return useQuery({
    queryKey: ['descuentos-vigentes'],
    queryFn: async () => {
      const { data, error } = await tablaComercial<DescuentoVigente[]>(
        'v_descuentos_vigentes',
      )
        .select('*')
        .order('cliente', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCambiarPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      productoId: string;
      precioLista: number;
      motivo: string | null;
    }) => {
      const { error } = await tablaComercial('precios_producto').insert({
        producto_id: p.productoId,
        precio_lista: p.precioLista,
        motivo: p.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['precios-vigentes'] });
      avisarExito('Precio actualizado. El anterior queda en el historial.');
    },
    onError: avisarError,
  });
}

export function useCargarDescuento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      clienteId: string;
      productoId: string | null;
      porcentaje: number;
      motivo: string | null;
    }) => {
      const { error } = await tablaComercial('descuentos_cliente').insert({
        cliente_id: d.clienteId,
        producto_id: d.productoId,
        porcentaje: d.porcentaje,
        motivo: d.motivo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['descuentos-vigentes'] });
      avisarExito(v.porcentaje === 0 ? 'Descuento quitado.' : 'Descuento guardado.');
    },
    onError: avisarError,
  });
}

/** En borrador: todos los renglones al precio de lista con el descuento del cliente. */
export function useAplicarPreciosPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { data, error } = await rpcComercial<number>('aplicar_precios_pedido', {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n, pedidoId) => {
      void qc.invalidateQueries({ queryKey: ['pedido-renglones', pedidoId] });
      avisarExito(
        n === 0
          ? 'Ningún producto tiene precio de lista cargado.'
          : `Precio de lista aplicado a ${n} productos.`,
      );
    },
    onError: avisarError,
  });
}
