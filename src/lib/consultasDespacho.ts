/**
 * Despacho (D-factura-x-1, 20261118170100): la factura X de un pedido de venta
 * es lo que salió de verdad. Despacho la carga y el stock baja por lo
 * facturado; si algún SKU queda en negativo, carga su conteo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avisarError, avisarExito } from './consultas';
import { comercial, gmp } from './supabase';
import type { FacturaX } from './facturaX';
import type { Json } from './database.types';

export interface RenglonPedidoDespacho {
  producto_id: string;
  codigo: string;
  producto: string;
  cantidad: number;
}

/** Lo que lleva el pedido, por producto. */
export function useRenglonesPedido(pedidoId: string | null) {
  return useQuery({
    queryKey: ['despacho-renglones', pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<RenglonPedidoDespacho[]> => {
      // Sin embed: productos está en otro esquema (como 22c4910, historial).
      const { data, error } = await comercial()
        .from('pedido_renglones')
        .select('producto_id, cantidad')
        .eq('pedido_id', pedidoId!)
        .eq('anulado', false);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r) => r.producto_id))];
      const { data: ps, error: e2 } = ids.length
        ? await gmp().from('productos').select('id, codigo_interno, nombre').in('id', ids)
        : { data: [], error: null };
      if (e2) throw e2;
      const porId = new Map((ps ?? []).map((p) => [p.id, p]));
      const m = new Map<string, RenglonPedidoDespacho>();
      for (const r of data ?? []) {
        const p = porId.get(r.producto_id);
        const x = m.get(r.producto_id) ?? {
          producto_id: r.producto_id,
          codigo: p?.codigo_interno ?? '',
          producto: p?.nombre ?? '',
          cantidad: 0,
        };
        x.cantidad += Number(r.cantidad);
        m.set(r.producto_id, x);
      }
      return [...m.values()];
    },
  });
}

/** Nombre de cada código de la factura, para lo que no estaba en el pedido. */
export function useProductosPorCodigo(codigos: string[]) {
  return useQuery({
    queryKey: ['productos-por-codigo', [...codigos].sort().join(',')],
    enabled: codigos.length > 0,
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('productos')
        .select('id, codigo_interno, nombre')
        .in('codigo_interno', codigos)
        .is('tercero_id', null);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.codigo_interno.toUpperCase(), p]));
    },
  });
}

export interface FacturaXCargada {
  id: string;
  numero: string;
  fecha: string;
  pedido_id: string;
  cargada_en: string;
}

/** Facturas X ya cargadas (para el historial). */
export function useFacturasX() {
  return useQuery({
    queryKey: ['facturas-x'],
    queryFn: async (): Promise<FacturaXCargada[]> => {
      const { data, error } = await comercial()
        .from('facturas_x')
        .select('id, numero, fecha, pedido_id, cargada_en')
        .order('cargada_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface NegativoFacturaX {
  producto_id: string;
  codigo: string;
  producto: string;
  saldo: number;
}

export interface ResultadoFacturaX {
  factura_id: string;
  deposito_id: string;
  negativos: NegativoFacturaX[];
  sin_catalogo: string | null;
}

const invalidar = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of [
    'ventas',
    'venta',
    'facturas-x',
    'reservado-pedido',
    'reservas-pt',
    'pendientes-despacho',
    'disponible-pt',
    'stock-pt',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
};

export function useCargarFacturaX() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { pedidoId: string; factura: FacturaX }) => {
      const { data, error } = await comercial().rpc('cargar_factura_x', {
        p_pedido_id: a.pedidoId,
        p_factura: a.factura as unknown as Json,
      });
      if (error) throw error;
      return data as unknown as ResultadoFacturaX;
    },
    onSuccess: (r) => {
      invalidar(qc);
      avisarExito(
        r.negativos.length
          ? `Factura cargada. ${r.negativos.length} SKU quedaron en negativo: contalos.`
          : 'Factura cargada: el stock bajó por lo facturado.',
      );
    },
    onError: avisarError,
  });
}

export function useCargarConteo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      depositoId: string;
      conteos: { producto_id: string; cantidad: number }[];
    }) => {
      const { error } = await comercial().rpc('cargar_conteo_pt', {
        p_deposito_id: a.depositoId,
        p_conteos: a.conteos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Conteo cargado: el stock quedó como lo contaste.');
    },
    onError: avisarError,
  });
}
