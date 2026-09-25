/**
 * Stock de seguridad y punto de pedido por SKU, y el depósito de producto
 * terminado en fábrica (PTF) del que sale (20260925100000).
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { comercial } from './supabase';
import { avisarError, avisarExito } from './consultas';

export type FilaStockSeguridad =
  Database['comercial']['Views']['v_stock_seguridad']['Row'];

/** Quién fija la meta de SS: la política de comercial.metas_stock_seguridad. */
export const ROLES_METAS_SS = [
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
  'GERENCIA',
] as const;

/** Quién registra entregas y conteos de producto terminado (movimientos_pt). */
export const ROLES_STOCK_PT = [
  'GERENCIA_PRODUCCION',
  'ADMINISTRACION',
  'GERENCIA',
  'ENCARGADA_STOCK',
] as const;

/** Lo que hay que producir o comprar para volver al punto de pedido. */
export const faltaTotal = (f: FilaStockSeguridad) =>
  Math.ceil(Number(f.falta_disponible ?? 0) + Number(f.falta_ss ?? 0));

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['stock-seguridad', 'stock-punto-venta', 'movimientos-pt', 'pedidos'])
    void qc.invalidateQueries({ queryKey: [k] });
}

export function useStockSeguridad() {
  return useQuery({
    queryKey: ['stock-seguridad'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_stock_seguridad')
        .select('*')
        .order('sku_cod');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGuardarMetaSS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { skuId: string; ssMeta: number; motivo: string | null }) => {
      const { error } = await comercial()
        .from('metas_stock_seguridad')
        .insert({ sku_id: m.skuId, ss_meta: m.ssMeta, motivo: m.motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Meta de stock de seguridad guardada.');
    },
    onError: avisarError,
  });
}

export function useAltaProductoDeSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skuId: string) => {
      const { data, error } = await comercial().rpc('alta_producto_de_sku', {
        p_sku_id: skuId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['productos'] });
      avisarExito('Producto dado de alta en el catálogo.');
    },
    onError: avisarError,
  });
}

/**
 * «Producir para stock»: un pedido de Nail Show marcado para stock, enviado a
 * producción. Al terminarlo, lo producido entra al depósito PTF.
 */
export function useProducirParaStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      renglones: { productoId: string; cantidad: number }[];
      observaciones: string | null;
    }) => {
      // Número siguiente con el formato S-0001, contando también los borrados.
      const previos = await comercial()
        .from('pedidos')
        .select('numero')
        .like('numero', 'S-%');
      if (previos.error) throw previos.error;
      const max = (previos.data ?? []).reduce((m, r) => {
        const x = /^S-(\d+)$/.exec(r.numero);
        return x ? Math.max(m, Number(x[1])) : m;
      }, 0);
      const numero = `S-${String(max + 1).padStart(4, '0')}`;

      const { data: pedido, error } = await comercial()
        .from('pedidos')
        .insert({
          numero,
          cliente: 'Stock en fábrica',
          para_stock: true,
          observaciones: p.observaciones,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: errR } = await comercial()
        .from('pedido_renglones')
        .insert(
          p.renglones.map((r) => ({
            pedido_id: pedido.id,
            producto_id: r.productoId,
            cantidad: r.cantidad,
          })),
        );
      if (errR) throw errR;

      const { data: act, error: errE } = await comercial()
        .from('pedidos')
        .update({ estado: 'CONFIRMADO' })
        .eq('id', pedido.id)
        .select('id');
      if (errE) throw errE;
      if (!act || act.length === 0)
        throw new Error('No se pudo enviar el pedido a producción.');
      return pedido;
    },
    onSuccess: (p) => {
      invalidar(qc);
      avisarExito(`Pedido ${p.numero} para stock enviado a producción.`);
    },
    onError: avisarError,
  });
}

/** Conteo de producto terminado: deja el saldo del depósito en lo contado. */
export function useRegistrarConteoPt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      productoId: string;
      cantidad: number;
      observacion: string | null;
      deposito: string;
    }) => {
      const { data, error } = await comercial().rpc('registrar_conteo_pt', {
        p_producto_id: c.productoId,
        p_cantidad: c.cantidad,
        ...(c.observacion ? { p_observacion: c.observacion } : {}),
        p_deposito_numero: c.deposito,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: (dif) => {
      invalidar(qc);
      avisarExito(
        dif === 0
          ? 'Conteo registrado: coincide con lo que había.'
          : `Conteo registrado: ajuste de ${dif > 0 ? '+' : ''}${dif}.`,
      );
    },
    onError: avisarError,
  });
}

/** Entrega al cliente: sale del depósito PTF (comercial.entregar_pedido). */
export function useEntregarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { error } = await comercial().rpc('entregar_pedido', {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['pedido', id] });
      avisarExito('Pedido entregado: salió del stock en fábrica.');
    },
    onError: avisarError,
  });
}
