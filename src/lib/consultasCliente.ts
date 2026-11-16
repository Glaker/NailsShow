/**
 * Portal de clientes (20261110160100, D-portal-clientes-1). El cliente entra
 * sin rol interno y no lee tablas: todo pasa por las funciones
 * comercial.cliente_*, que solo devuelven la lista de precios y SUS pedidos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { numero } from './formato';
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
  /** Alias de búsqueda (P2): «crema», «cremas»… */
  alias: string[];
}

/** Cómo se arma una caja de aromas (P3, opciones por caja). */
export type OpcionCaja =
  | 'SURTIDO'
  | 'AMOR'
  | 'PAZ'
  | 'AIRE'
  | 'AMOR_PAZ'
  | 'AMOR_AIRE'
  | 'PAZ_AIRE'
  | 'UNA_DE_CADA';

/** Las 8 opciones, siempre todas a la vista; «Surtido» va solo, sin explicación. */
export const OPCIONES_CAJA: { valor: OpcionCaja; etiqueta: string }[] = [
  { valor: 'SURTIDO', etiqueta: 'Surtido' },
  { valor: 'AMOR', etiqueta: 'Amor' },
  { valor: 'PAZ', etiqueta: 'Paz' },
  { valor: 'AIRE', etiqueta: 'Aire' },
  { valor: 'AMOR_PAZ', etiqueta: 'Amor y Paz' },
  { valor: 'AMOR_AIRE', etiqueta: 'Amor y Aire' },
  { valor: 'PAZ_AIRE', etiqueta: 'Paz y Aire' },
  { valor: 'UNA_DE_CADA', etiqueta: 'Una de cada una' },
];
export const etiquetaOpcion = (o: string) =>
  OPCIONES_CAJA.find((x) => x.valor === o)?.etiqueta ?? o;
export const OPCIONES_MIXTAS: OpcionCaja[] = ['AMOR_PAZ', 'AMOR_AIRE', 'PAZ_AIRE'];

/** Las cajas del carrito: clave `caja_id|opcion` → cantidad de cajas. */
export type CarritoCajas = Map<string, number>;
export const claveCaja = (caja_id: string, opcion: string) => `${caja_id}|${opcion}`;
export const partirClaveCaja = (k: string) => {
  const [caja_id = '', opcion = ''] = k.split('|');
  return { caja_id, opcion: opcion as OpcionCaja };
};
/** «Una de cada una» se pide en sets de 3 cajas; el resto de a una. */
export const pasoOpcion = (o: string) => (o === 'UNA_DE_CADA' ? 3 : 1);

/** «5 cajas», o «2 sets (6 cajas)» para «Una de cada una» (sets de 3). */
export function textoCajas(opcion: string, cajas: number) {
  if (opcion !== 'UNA_DE_CADA')
    return `${numero(cajas, 0)} ${cajas === 1 ? 'caja' : 'cajas'}`;
  const sets = cajas / 3;
  return `${numero(sets, 0)} ${sets === 1 ? 'set' : 'sets'} (${numero(cajas, 0)} cajas)`;
}

/** Un grupo de aromas que se vende por caja (comercial.cliente_cajas). */
export interface CajaCliente {
  caja_id: string;
  nombre: string;
  unidades_caja: number;
  porcentaje: number;
  precio_promo: number;
  /**
   * Siempre true desde 20261116120000 (D-opciones-caja-4: con unidades impares el
   * primer aroma lleva la mitad hacia arriba). Queda por contrato con la base y Hada.
   */
  mixta: boolean;
}

export interface CajaPedido {
  caja_id: string;
  nombre: string;
  opcion: OpcionCaja;
  cajas: number;
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
  /** Cajas con su opción; los renglones traen solo las unidades sueltas. */
  cajas: CajaPedido[];
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
            alias?: string[] | null;
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
        alias: x.alias ?? [],
      })),
    retry: false,
  });
}

/** Si la base todavía no la tiene, la pantalla simplemente no ofrece cajas. */
export function useCajasCliente(enabled = true) {
  return useQuery({
    queryKey: ['cliente', 'cajas'],
    enabled,
    queryFn: async () =>
      (
        await rpc<
          {
            caja_id: string;
            nombre: string;
            unidades_caja: number;
            porcentaje: unknown;
            precio_promo: unknown;
            mixta: boolean;
          }[]
        >('cliente_cajas')
      ).map((c): CajaCliente => ({
        ...c,
        porcentaje: n(c.porcentaje),
        precio_promo: n(c.precio_promo),
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
        cajas: (p.cajas ?? []).map((c) => ({ ...c, cajas: n(c.cajas) })),
      })),
    // Ventas lo va tomando: se refresca al volver a la pestaña.
    refetchOnWindowFocus: true,
  });
}

export interface EnvioPedido {
  id: string | null;
  renglones: { producto_id: string; cantidad: number }[];
  /** null = no tocar las cajas del pedido; [] = sacarlas todas. */
  cajas: { caja_id: string; opcion: OpcionCaja; cajas: number }[] | null;
  observaciones: string;
  /** Clave de idempotencia del envío (P6, D-hada-4): solo para pedidos nuevos. */
  clave?: string;
}

export function useEnviarPedidoCliente() {
  const qc = useQueryClient();
  return useMutation({
    // Pedido nuevo con clave: un reintento tras una respuesta perdida devuelve el mismo pedido.
    mutationFn: (a: EnvioPedido) =>
      a.id === null && a.clave
        ? rpc<string>('cliente_enviar_pedido_unico', {
            p_clave: a.clave,
            p_renglones: a.renglones,
            p_observaciones: a.observaciones,
            p_cajas: a.cajas,
          })
        : rpc<string>('cliente_enviar_pedido', {
            p_id: a.id,
            p_renglones: a.renglones,
            p_observaciones: a.observaciones,
            p_cajas: a.cajas,
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
