/**
 * Portal de clientes (D-portal-clientes-1): qué cuenta es de qué cliente y qué
 * pedidos llegaron armados por el cliente desde el portal.
 *
 * `database.types.ts` todavía no tiene `comercial.clientes_usuarios` ni
 * `comercial.pedidos.enviado_por_cliente_en` (migración 20261110160100): las
 * consultas van por un cliente sin tipar y las filas se tipan a mano acá, como
 * en consultasVentas.ts. Regenerar los tipos con `npm run db:types` después del
 * `db push` y reemplazar estas filas por las generadas.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisarError, avisarExito } from './consultas';
import { supabase } from './supabase';

const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');

/** Fila de comercial.clientes_usuarios (solo las columnas que usa la pantalla). */
interface VinculoClienteRow {
  usuario_id: string;
  cliente_id: string;
}

/** Cuenta del portal → cliente mayorista, como Map usuario_id → cliente_id. */
export function useVinculosClientes() {
  return useQuery({
    queryKey: ['vinculos-clientes'],
    queryFn: async () => {
      const r = (await comercialST()
        .from('clientes_usuarios')
        .select('usuario_id, cliente_id')) as {
        data: VinculoClienteRow[] | null;
        error: Error | null;
      };
      if (r.error) throw r.error;
      return new Map<string, string>(
        (r.data ?? []).map((v) => [v.usuario_id, v.cliente_id]),
      );
    },
  });
}

/**
 * Vincula una cuenta con su cliente: alta si no tiene fila, cambio de cliente si
 * ya la tiene (no hay DELETE, RN-49). La base exige que la cuenta tenga rol
 * CLIENTE, así que el rol se guarda antes. `creado_por` lo pone la base.
 */
export function useVincularCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { usuarioId: string; clienteId: string }) => {
      const tabla = () => comercialST().from('clientes_usuarios');
      const previo = (await tabla()
        .select('usuario_id')
        .eq('usuario_id', v.usuarioId)
        .maybeSingle()) as {
        data: { usuario_id: string } | null;
        error: Error | null;
      };
      if (previo.error) throw previo.error;

      if (previo.data) {
        const r = (await tabla()
          .update({ cliente_id: v.clienteId })
          .eq('usuario_id', v.usuarioId)
          .select('usuario_id')) as {
          data: { usuario_id: string }[] | null;
          error: Error | null;
        };
        if (r.error) throw r.error;
        /* Un UPDATE que RLS filtra no falla: afecta cero filas. */
        if (!r.data?.length)
          throw new Error(
            'No se cambió el cliente: tu rol no puede vincular cuentas del portal.',
          );
      } else {
        const r = await tabla().insert({
          usuario_id: v.usuarioId,
          cliente_id: v.clienteId,
        });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vinculos-clientes'] });
      avisarExito('Cuenta vinculada al cliente.');
    },
    onError: avisarError,
  });
}

/**
 * Pedidos de venta que el cliente envió desde el portal (enviado_por_cliente_en
 * no nulo). Los que no están acá los cargó Ventas. Clave bajo 'ventas' para que
 * la invalide la misma función que refresca la central de pedidos.
 */
export function useEnviadosPorCliente() {
  return useQuery({
    queryKey: ['ventas', 'enviados-por-cliente'],
    queryFn: async () => {
      const r = (await comercialST()
        .from('pedidos')
        .select('id, enviado_por_cliente_en')
        .not('enviado_por_cliente_en', 'is', null)) as {
        data: { id: string }[] | null;
        error: Error | null;
      };
      if (r.error) throw r.error;
      return new Set<string>((r.data ?? []).map((p) => p.id));
    },
  });
}

/** Cuándo lo envió el cliente desde el portal, o null si lo cargó Ventas. */
export function useEnvioPortal(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['venta', pedidoId, 'portal'],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const r = (await comercialST()
        .from('pedidos')
        .select('enviado_por_cliente_en')
        .eq('id', pedidoId!)
        .single()) as {
        data: { enviado_por_cliente_en: string | null } | null;
        error: Error | null;
      };
      if (r.error) throw r.error;
      return r.data?.enviado_por_cliente_en ?? null;
    },
  });
}
