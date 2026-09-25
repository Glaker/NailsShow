/**
 * Consultas del entorno Tercerizados: clientes para los que Nail Show fabrica,
 * su stock, sus productos, el origen de los insumos al producir y las
 * reservas.
 *
 * Tipado desde los tipos generados (CLAUDE.md §6). Las reglas viven en la base
 * (20260924150100 y 20260924150200); acá solo se llaman.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { comercial, gmp } from './supabase';
import { avisarError, avisarExito, invalidarStock } from './consultas';

export type Tercero = Database['gmp']['Tables']['terceros']['Row'];
export type StockTercero = Database['comercial']['Views']['v_stock_tercero']['Row'];
export type ReservaVigente = Database['comercial']['Views']['v_reservas_vigentes']['Row'];
export type InsumoPedido =
  Database['comercial']['Functions']['insumos_pedido']['Returns'][number];
export type FaltanteTitular =
  Database['comercial']['Functions']['faltantes_por_titular']['Returns'][number];
export type TipoInsumo = Database['gmp']['Enums']['tipo_insumo_enum'];

/** Quién da de alta un cliente tercerizado: la política de gmp.terceros. */
export const ROLES_ALTA_TERCERO = [
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
  'DIRECCION_TECNICA',
] as const;

/** Quién ingresa material y maneja el stock del tercero (recepción física, §3.3). */
export const ROLES_STOCK_TERCERO = ['GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'] as const;

/** Quién reserva: la política de comercial.reservas_stock. */
export const ROLES_RESERVAN = [
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
] as const;

/**
 * Colores de los cuadritos. Sin verde, amarillo, rojo ni gris: son los de los
 * rótulos de I.20.2 y están reservados para el estado del material (theme.ts).
 * Naranja tampoco, por cercano al amarillo de cuarentena.
 */
export const COLORES_TERCERO = [
  'teal',
  'cyan',
  'blue',
  'indigo',
  'grape',
  'pink',
] as const;

export const TEXTO_TIPO_INSUMO: Record<TipoInsumo, string> = {
  MATERIA_PRIMA: 'Materia prima',
  MATERIAL_ENVASE: 'Envase',
  MATERIAL_EMPAQUE: 'Empaque',
  ETIQUETA: 'Etiqueta',
  SEMIELABORADO: 'Semielaborado / granel',
};

/** Color a mostrar: el guardado si está en la paleta permitida, si no teal. */
export function colorTercero(t: Pick<Tercero, 'color'> | null | undefined): string {
  return t && (COLORES_TERCERO as readonly string[]).includes(t.color) ? t.color : 'teal';
}

/* ------------------------------------------------------------------------- *
 * Terceros
 * ------------------------------------------------------------------------- */

export function useTerceros() {
  return useQuery({
    queryKey: ['tercerizados', 'terceros'],
    queryFn: async () => {
      const { data, error } = await gmp().from('terceros').select('*').order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGuardarTercero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      datos,
    }: {
      id: string | null;
      datos: {
        nombre: string;
        color: string;
        activo?: boolean;
        observaciones?: string | null;
      };
    }) => {
      if (id) {
        const { data, error } = await gmp()
          .from('terceros')
          .update(datos)
          .eq('id', id)
          .select();
        if (error) throw error;
        // Un UPDATE que RLS filtra no falla: afecta cero filas.
        if (!data || data.length === 0)
          throw new Error('Tu rol no puede editar clientes tercerizados.');
        return data[0]!;
      }
      const { data, error } = await gmp()
        .from('terceros')
        .insert(datos)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tercerizados'] });
      avisarExito(v.id ? 'Cliente actualizado.' : 'Cliente tercerizado dado de alta.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Stock del tercero
 * ------------------------------------------------------------------------- */

/** Por insumo. Sin `terceroId`, el de todos (para los cuadritos). */
export function useStockTercero(terceroId?: string) {
  return useQuery({
    queryKey: ['tercerizados', 'stock', terceroId ?? 'todos'],
    queryFn: async () => {
      let consulta = comercial().from('v_stock_tercero').select('*');
      if (terceroId) consulta = consulta.eq('tercero_id', terceroId);
      const { data, error } = await consulta.order('insumo_nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Por lote y depósito, con estado de calidad: para quitar stock y ver cuarentena. */
export function useExistenciasTercero(terceroId: string | undefined) {
  return useQuery({
    queryKey: ['tercerizados', 'existencias', terceroId],
    enabled: Boolean(terceroId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_existencias')
        .select('*')
        .eq('tercero_id', terceroId!)
        .gt('saldo', 0)
        .order('insumo_nombre')
        .order('plazo_validez', { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RenglonIngreso {
  insumo_id: string;
  cantidad: number;
  lote?: string | null;
  vence?: string | null;
  bultos?: number | null;
  protocolo?: boolean;
  peso_kg?: number | null;
}

/**
 * «Agregar stock»: recepción automática, lotes en cuarentena con rótulo y
 * entrada a stock, en una transacción (comercial.ingresar_stock_tercero).
 */
export function useIngresarStockTercero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: {
      terceroId: string;
      renglones: RenglonIngreso[];
      remito: string | null;
      observaciones: string | null;
      contenedoresLimpiados: boolean;
    }) => {
      const { data, error } = await comercial().rpc('ingresar_stock_tercero', {
        p_tercero_id: i.terceroId,
        p_items: i.renglones.map((r) =>
          Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== '')),
        ),
        ...(i.remito ? { p_remito: i.remito } : {}),
        ...(i.observaciones ? { p_observaciones: i.observaciones } : {}),
        p_contenedores_limpiados: i.contenedoresLimpiados,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidarStock(qc);
      void qc.invalidateQueries({ queryKey: ['lotes'] });
      avisarExito('Stock ingresado. Queda en cuarentena hasta que lo apruebe Calidad.');
    },
    onError: avisarError,
  });
}

/** Alta de insumo genérico del tercero, con código T-nnnnn que pone la base. */
export function useAltaInsumoTercero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: {
      terceroId: string;
      nombre: string;
      tipo: TipoInsumo;
      unidad: string;
      esInflamable: boolean;
    }) => {
      const { data, error } = await gmp().rpc('alta_insumo_tercero', {
        p_tercero_id: i.terceroId,
        p_nombre: i.nombre,
        p_tipo: i.tipo,
        p_unidad: i.unidad,
        p_es_inflamable: i.esInflamable,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      avisarExito(`Insumo ${d.codigo_interno} dado de alta.`);
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Productos del tercero
 * ------------------------------------------------------------------------- */

export function useAltaProductoTercero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      terceroId: string;
      nombre: string;
      baseId: string | null;
      variedad: string | null;
    }) => {
      const { data, error } = await gmp().rpc('alta_producto_tercero', {
        p_tercero_id: p.terceroId,
        p_nombre: p.nombre,
        ...(p.baseId ? { p_base_id: p.baseId } : {}),
        ...(p.variedad ? { p_variedad: p.variedad } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['productos'] });
      void qc.invalidateQueries({ queryKey: ['productos-con-lista'] });
      void qc.invalidateQueries({ queryKey: ['materiales'] });
      avisarExito(`Producto ${d.codigo_interno} dado de alta.`);
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Producción: de qué stock sale cada insumo
 * ------------------------------------------------------------------------- */

export function useInsumosPedido(pedidoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['tercerizados', 'insumos-pedido', pedidoId],
    enabled: Boolean(pedidoId) && habilitado,
    queryFn: async () => {
      const { data, error } = await comercial().rpc('insumos_pedido', {
        p_pedido_id: pedidoId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePasarAProduccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      pedidoId: string;
      origenes: { insumo_id: string; origen: 'NAILSHOW' | 'TERCERO' }[];
    }) => {
      const { error } = await comercial().rpc('pasar_a_produccion', {
        p_pedido_id: p.pedidoId,
        p_origenes: p.origenes,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      for (const k of ['pedidos', 'faltantes-en-curso', 'tercerizados'])
        void qc.invalidateQueries({ queryKey: [k] });
      void qc.invalidateQueries({ queryKey: ['pedido', v.pedidoId] });
      void qc.invalidateQueries({ queryKey: ['pedido-faltantes', v.pedidoId] });
      avisarExito('Pedido en producción.');
    },
    onError: avisarError,
  });
}

/** Lo que el cliente tiene que traer para los pedidos en curso. */
export function useFaltantesTercero(terceroId: string | undefined) {
  return useQuery({
    queryKey: ['tercerizados', 'faltantes', terceroId],
    enabled: Boolean(terceroId),
    queryFn: async () => {
      const { data, error } = await comercial().rpc('faltantes_por_titular', {
        p_tercero_id: terceroId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------------- *
 * Reservas
 * ------------------------------------------------------------------------- */

/**
 * Reservas vigentes. `titular`: de qué stock (null = Nail Show, undefined =
 * todas). `para`: para quién (mismo criterio).
 */
export function useReservasVigentes(
  filtro: {
    titular?: string | null;
    para?: string | null;
  } = {},
) {
  return useQuery({
    queryKey: ['tercerizados', 'reservas', filtro.titular, filtro.para],
    queryFn: async () => {
      let consulta = comercial().from('v_reservas_vigentes').select('*');
      if (filtro.titular === null) consulta = consulta.is('tercero_id', null);
      else if (filtro.titular) consulta = consulta.eq('tercero_id', filtro.titular);
      if (filtro.para === null) consulta = consulta.is('para_tercero_id', null);
      else if (filtro.para) consulta = consulta.eq('para_tercero_id', filtro.para);
      const { data, error } = await consulta.order('vence_en');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReservar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      insumoId: string;
      cantidad: number;
      titular: string | null;
      para: string | null;
      motivo: string | null;
      venceEn: string;
    }) => {
      const { error } = await comercial().from('reservas_stock').insert({
        insumo_id: r.insumoId,
        cantidad: r.cantidad,
        // La pone el trigger desde el catálogo.
        unidad: '',
        tercero_id: r.titular,
        para_tercero_id: r.para,
        motivo: r.motivo,
        vence_en: r.venceEn,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarStock(qc);
      void qc.invalidateQueries({ queryKey: ['faltantes-en-curso'] });
      avisarExito('Reserva registrada.');
    },
    onError: avisarError,
  });
}

export function useLiberarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await comercial()
        .from('reservas_stock')
        .update({ liberada: true })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('Tu rol no puede liberar reservas.');
    },
    onSuccess: () => {
      invalidarStock(qc);
      void qc.invalidateQueries({ queryKey: ['faltantes-en-curso'] });
      avisarExito('Reserva liberada.');
    },
    onError: avisarError,
  });
}

/** Disponible de Nail Show por insumo (aprobado + apertura, menos reservado). */
export function useDisponibleNailShow() {
  return useQuery({
    queryKey: ['tercerizados', 'disponible-nailshow'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_disponible_por_insumo')
        .select('*')
        .order('insumo_nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}
