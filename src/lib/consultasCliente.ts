/**
 * Portal de clientes (20261110160100, D-portal-clientes-1). El cliente entra
 * sin rol interno y no lee tablas: todo pasa por las funciones
 * comercial.cliente_*, que solo devuelven la lista de precios y SUS pedidos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError } from './consultas';
import type { Escalon } from './consultasVentas';

const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');
const n = (x: unknown) => Number(x ?? 0);

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = (await comercialST().rpc(fn, args)) as {
    data: T;
    error: Error | null;
  };
  if (error) throw error;
  return data;
}

export interface ProductoCliente {
  producto_id: string;
  codigo: string;
  producto: string;
  rubro: string | null;
  precio_lista: number;
  precio_promo: number;
  /** Unidades del pack (el «mínimo» de la lista); null = se vende suelto. */
  pack: number | null;
}

export type EstadoCliente =
  'PENDIENTE' | 'EN_PRODUCCION' | 'EN_CAMINO' | 'FINALIZADO' | 'CANCELADO';

export interface PedidoCliente {
  id: string;
  numero: string;
  estado: string;
  /** Pendiente, en producción, en camino, finalizado o cancelado (20261112120000). */
  estado_cliente: EstadoCliente;
  enviado_en: string;
  fecha_entrega: string | null;
  editable: boolean;
  cancelado: boolean;
  observaciones: string | null;
  renglones: {
    producto_id: string;
    cantidad: number;
    producto: string;
    codigo: string;
  }[];
}

export function usePerfilCliente(enabled = true) {
  return useQuery({
    queryKey: ['cliente', 'perfil'],
    enabled,
    queryFn: () => rpc<{ cliente: string; nombre: string | null }>('cliente_perfil'),
    retry: false,
  });
}

export function useListaCliente() {
  return useQuery({
    queryKey: ['cliente', 'lista'],
    queryFn: async () =>
      (
        await rpc<
          {
            producto_id: string;
            codigo: string;
            producto: string;
            rubro: string | null;
            precio_lista: unknown;
            precio_promo: unknown;
            minimo: number | null;
          }[]
        >('cliente_lista')
      ).map((x): ProductoCliente => ({
        producto_id: x.producto_id,
        codigo: x.codigo,
        producto: x.producto,
        rubro: x.rubro,
        precio_lista: n(x.precio_lista),
        precio_promo: n(x.precio_promo),
        pack: x.minimo && x.minimo > 1 ? x.minimo : null,
      })),
    retry: false,
  });
}

export function useEscalaCliente() {
  return useQuery({
    queryKey: ['cliente', 'escala'],
    queryFn: async () =>
      (await rpc<{ desde_monto: unknown; porcentaje: unknown }[]>('cliente_escala')).map(
        (e): Escalon => ({ desde_monto: n(e.desde_monto), porcentaje: n(e.porcentaje) }),
      ),
    retry: false,
  });
}

export function usePedidosCliente(enabled = true) {
  return useQuery({
    queryKey: ['cliente', 'pedidos'],
    enabled,
    queryFn: async () =>
      (await rpc<PedidoCliente[]>('cliente_pedidos')).map((p) => ({
        ...p,
        renglones: p.renglones.map((r) => ({ ...r, cantidad: n(r.cantidad) })),
      })),
    // Ventas lo va tomando: se refresca al volver a la pestaña.
    refetchOnWindowFocus: true,
  });
}

export interface EnvioPedido {
  id: string | null;
  renglones: { producto_id: string; cantidad: number }[];
  observaciones: string;
}

export function useEnviarPedidoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      id: string | null;
      renglones: { producto_id: string; cantidad: number }[];
      observaciones: string;
    }) =>
      rpc<string>('cliente_enviar_pedido', {
        p_id: a.id,
        p_renglones: a.renglones,
        p_observaciones: a.observaciones,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cliente', 'pedidos'] }),
    onError: avisarError,
  });
}

export function useCancelarPedidoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<null>('cliente_cancelar_pedido', { p_id: id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cliente', 'pedidos'] }),
    onError: avisarError,
  });
}
