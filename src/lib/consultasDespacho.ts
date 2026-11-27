/**
 * Despacho (D-factura-x-1, 20261118180100): la factura X de un pedido de venta
 * es lo que salió de verdad. Despacho la carga y el stock baja por lo
 * facturado; si algún SKU queda en negativo, carga su conteo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avisarError, avisarExito } from './consultas';
import { comercial, gmp } from './supabase';
import type { FacturaX } from './facturaX';
import type { Json } from './database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export type Canal = 'MAYORISTA' | 'EDUCADORES' | 'MINORISTA';

export interface FacturaXCargada {
  id: string;
  numero: string;
  tipo: string;
  canal: Canal;
  fecha: string;
  cliente: string | null;
  total: number | null;
  pedido_id: string | null;
  cargada_en: string;
  /** Anulada por error de carga (20261127150000): su stock ya volvió. */
  anulada_en: string | null;
  motivo_anulacion: string | null;
}

/** Facturas de venta ya cargadas (para el historial). */
export function useFacturasX() {
  return useQuery({
    queryKey: ['facturas-x'],
    queryFn: async (): Promise<FacturaXCargada[]> => {
      const { data, error } = await comercial()
        .from('facturas_x')
        .select(
          'id, numero, tipo, canal, fecha, cliente, total, pedido_id, cargada_en, anulada_en, motivo_anulacion',
        )
        .order('cargada_en', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        ...f,
        canal: f.canal as Canal,
        total: f.total === null ? null : Number(f.total),
      }));
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

export interface FacturaYaCargada {
  tipo: string;
  numero: string;
  cargada_en: string;
  cargada_por: string | null;
  pdf_igual: boolean;
}

/**
 * Si esta factura (mismo PDF o mismo comprobante) ya se cargó, quién y
 * cuándo (20261125140000). Avisa antes de confirmar; la base igual la rechaza.
 */
export function useFacturaYaCargada(factura: FacturaX | null) {
  return useQuery({
    queryKey: [
      'facturas-x',
      'ya-cargada',
      factura?.pdf_sha256,
      factura?.tipo,
      factura?.numero,
    ],
    enabled: !!factura?.pdf_sha256,
    queryFn: async (): Promise<FacturaYaCargada | null> => {
      const r = (await (comercial() as unknown as SupabaseClient).rpc(
        'factura_ya_cargada',
        {
          p_pdf_sha256: factura!.pdf_sha256,
          p_tipo: factura!.tipo,
          p_emisor_cuit: factura!.emisor_cuit,
          p_numero: factura!.numero,
        },
      )) as { data: FacturaYaCargada[] | null; error: Error | null };
      if (r.error) throw r.error;
      return r.data?.[0] ?? null;
    },
  });
}

/** Anula una factura cargada por error: el stock vuelve y se puede cargar de nuevo. */
export function useAnularFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; motivo: string }) => {
      const { error } = await comercial().rpc('anular_factura_venta', {
        p_id: a.id,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Factura anulada: el stock volvió. Ya la podés cargar de nuevo.');
    },
    onError: avisarError,
  });
}

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

/** Educadores (J) o Minorista (C, B, X): sin pedido, sale de Berna (20261118193000). */
export function useCargarFacturaVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { canal: Exclude<Canal, 'MAYORISTA'>; factura: FacturaX }) => {
      const { data, error } = await comercial().rpc('cargar_factura_venta', {
        p_factura: { ...a.factura, canal: a.canal } as unknown as Json,
      });
      if (error) throw error;
      return data as unknown as ResultadoFacturaX;
    },
    onSuccess: (r) => {
      invalidar(qc);
      avisarExito(
        r.negativos.length
          ? `Factura cargada. ${r.negativos.length} SKU quedaron en negativo: contalos.`
          : 'Factura cargada: el stock de Berna bajó por lo facturado.',
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
