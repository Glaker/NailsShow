/**
 * Circuito de Calle 5 (20260929110000/110100): reservas de producto terminado,
 * despacho por pedido, lo que falta producir y transferencias fábrica ↔ Calle 5.
 *
 * El sistema no reparte: quién recibe qué lo deciden Silveira y Mati con
 * reservas y despachos. La base impide sacar lo que no hay o lo reservado para
 * otro.
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { comercial } from './supabase';

/** Una fila de `comercial.v_calle5`: por producto. */
export type FilaCalle5 = Database['comercial']['Views']['v_calle5']['Row'];

/** Una fila de `comercial.v_pendientes_despacho`: por pedido y producto. */
export type PendienteDespacho =
  Database['comercial']['Views']['v_pendientes_despacho']['Row'];

export type ReservaPtRow = Database['comercial']['Tables']['reservas_pt']['Row'];

export type DepositoPt = 'C5' | 'PTF';

/** Pedidos abiertos agrupados: cabecera + renglones con lo pendiente. */
export interface PedidoADespachar {
  pedido_id: string;
  numero: string;
  cliente: string;
  cliente_id: string | null;
  fecha_entrega: string | null;
  estado: string | null;
  renglones: PendienteDespacho[];
  pendiente: number;
}

export function agruparPorPedido(filas: PendienteDespacho[]): PedidoADespachar[] {
  const porPedido = new Map<string, PedidoADespachar>();
  for (const f of filas) {
    const idPedido = f.pedido_id ?? '';
    const p = porPedido.get(idPedido) ?? {
      pedido_id: idPedido,
      numero: f.numero ?? '',
      cliente: f.cliente ?? '',
      cliente_id: f.cliente_id,
      fecha_entrega: f.fecha_entrega,
      estado: f.estado,
      renglones: [],
      pendiente: 0,
    };
    p.renglones.push(f);
    p.pendiente += Number(f.pendiente);
    porPedido.set(idPedido, p);
  }
  return [...porPedido.values()]
    .filter((p) => p.pendiente > 0)
    .sort((a, b) => (a.fecha_entrega ?? '9999').localeCompare(b.fecha_entrega ?? '9999'));
}

/**
 * Cuánto puede salir de Calle 5 para un pedido: lo libre más lo reservado para
 * ese pedido o para su cliente. Espejo de la base, que es la autoridad.
 */
export function disponiblePara(
  productoId: string,
  pedidoId: string,
  clienteId: string | null,
  calle5: FilaCalle5[],
  reservas: ReservaPtRow[],
): number {
  const libre = Number(calle5.find((f) => f.producto_id === productoId)?.libre ?? 0);
  const suyo = reservas
    .filter(
      (r) =>
        !r.liberada &&
        r.producto_id === productoId &&
        (r.pedido_id === pedidoId ||
          (r.pedido_id === null && clienteId !== null && r.cliente_id === clienteId)),
    )
    .reduce((a, r) => a + Number(r.cantidad) - Number(r.consumido), 0);
  return Math.max(libre, 0) + suyo;
}

const CLAVES = [
  'calle5',
  'pendientes-despacho',
  'reservas-pt',
  'stock-punto-venta',
  'movimientos-pt',
  'stock-seguridad',
  'pedidos',
];

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of CLAVES) void qc.invalidateQueries({ queryKey: [k] });
}

export function useCalle5() {
  return useQuery({
    queryKey: ['calle5'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_calle5')
        .select('*')
        .order('producto');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePendientesDespacho(pedidoId?: string) {
  return useQuery({
    queryKey: ['pendientes-despacho', pedidoId ?? null],
    queryFn: async () => {
      let c = comercial().from('v_pendientes_despacho').select('*');
      if (pedidoId) c = c.eq('pedido_id', pedidoId);
      const { data, error } = await c;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReservasPt() {
  return useQuery({
    queryKey: ['reservas-pt'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('reservas_pt')
        .select('*')
        .eq('liberada', false)
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((r) => Number(r.consumido) < Number(r.cantidad));
    },
  });
}

export function useReservarPt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      productoId: string;
      depositoId: string;
      cantidad: number;
      clienteId: string | null;
      pedidoId: string | null;
      observacion: string | null;
    }) => {
      const { error } = await comercial().from('reservas_pt').insert({
        producto_id: r.productoId,
        deposito_id: r.depositoId,
        cantidad: r.cantidad,
        cliente_id: r.clienteId,
        pedido_id: r.pedidoId,
        observacion: r.observacion,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Reserva registrada.');
    },
    onError: avisarError,
  });
}

export function useLiberarReservaPt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id: string; motivo: string }) => {
      const { error } = await comercial().rpc('liberar_reserva_pt', {
        p_id: r.id,
        p_motivo: r.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Reserva liberada.');
    },
    onError: avisarError,
  });
}

export function useDespacharPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      pedidoId: string;
      renglones: { productoId: string; cantidad: number }[];
      deposito: DepositoPt;
      conFaltantes: boolean;
      observacion: string | null;
    }) => {
      const { error } = await comercial().rpc('despachar_pedido', {
        p_pedido_id: d.pedidoId,
        p_renglones: d.renglones.map((r) => ({
          producto_id: r.productoId,
          cantidad: r.cantidad,
        })),
        p_deposito: d.deposito,
        p_con_faltantes: d.conFaltantes,
        ...(d.observacion === null ? {} : { p_observacion: d.observacion }),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidar(qc);
      void qc.invalidateQueries({ queryKey: ['pedido', v.pedidoId] });
      avisarExito(
        v.conFaltantes
          ? 'Despacho registrado. Lo que faltó queda pendiente en el pedido.'
          : 'Pedido despachado completo.',
      );
    },
    onError: avisarError,
  });
}

export function useTransferirPt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      productoId: string;
      cantidad: number;
      origen: DepositoPt;
      destino: DepositoPt;
    }) => {
      const { error } = await comercial().rpc('transferir_pt', {
        p_producto_id: t.productoId,
        p_cantidad: t.cantidad,
        p_origen: t.origen,
        p_destino: t.destino,
      });
      if (error) throw error;
    },
    onSuccess: (_d, t) => {
      invalidar(qc);
      avisarExito(t.destino === 'C5' ? 'Enviado a Calle 5.' : 'Devuelto a fábrica.');
    },
    onError: avisarError,
  });
}

/**
 * «Mandar a producir lo que falta»: un pedido para stock con destino sugerido
 * Calle 5, enviado a producción. Al terminarlo, Producción confirma adónde va.
 */
export function useProducirParaCalle5() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      depositoC5Id: string;
      renglones: { productoId: string; cantidad: number }[];
      observaciones: string | null;
    }) => {
      // Número siguiente con el formato S-0001, contando también los borrados.
      const previos = await comercial().from('pedidos').select('numero');
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
          cliente: 'Para Calle 5',
          para_stock: true,
          destino_deposito_id: p.depositoC5Id,
          observaciones: p.observaciones,
        })
        .select('id, numero')
        .single();
      if (error) throw error;
      if (!pedido) throw new Error('No se pudo crear el pedido.');

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
      avisarExito(`Pedido ${p?.numero ?? ''} enviado a producción, con destino Calle 5.`);
    },
    onError: avisarError,
  });
}
