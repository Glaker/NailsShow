/**
 * Consultas de pedidos, lista de materiales y punto de venta.
 *
 * Va aparte de `consultas.ts` por tamaño: ese archivo ya pasa las mil líneas y
 * cubre el circuito regulado. Esto es comercial.
 *
 * MISMA DEUDA QUE EL BLOQUE DE FÓRMULAS. `database.types.ts` todavía no conoce
 * `comercial.pedidos`, `gmp.materiales_acondicionamiento` ni
 * `comercial.movimientos_pt`: las migraciones están en el repositorio pero no
 * hubo credenciales para correr `npm run db:types` contra el proyecto alojado.
 * Los tipos de fila de acá están escritos a mano, en contra de CLAUDE.md §6, y
 * se borran en cuanto se regeneren los tipos.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { comercial, gmp } from './supabase';
import { avisarError, avisarExito, type ConsultaTabla } from './consultas';

/* ------------------------------------------------------------------------- *
 * Tipos de fila (puente temporal)
 * ------------------------------------------------------------------------- */

export type EstadoPedido =
  'BORRADOR' | 'CONFIRMADO' | 'EN_PRODUCCION' | 'CUMPLIDO' | 'CANCELADO';

export interface PedidoRow {
  id: string;
  numero: string;
  cliente: string;
  fecha: string;
  fecha_entrega: string | null;
  estado: EstadoPedido;
  observaciones: string | null;
  creado_en: string;
}

export interface PedidoRenglonRow {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  producto: { nombre: string } | null;
}

/** Una fila de `comercial.explotar_pedido()`. Solo vienen los faltantes. */
export interface RenglonFaltante {
  insumo_id: string;
  codigo_interno: string | null;
  insumo: string;
  unidad: string | null;
  necesario: number;
  disponible: number;
  faltante: number;
  proveedor_id: string | null;
  proveedor: string | null;
  proveedor_estado: string | null;
  ultima_compra: string | null;
}

export interface MaterialAcondicionamientoRow {
  id: string;
  producto_id: string;
  insumo_id: string;
  cantidad_por_unidad: number;
  merma: number;
  activo: boolean;
  insumo: { nombre: string; codigo_interno: string; unidad_medida: string | null } | null;
}

export interface StockPuntoVentaRow {
  deposito_id: string;
  deposito: string;
  producto_id: string;
  producto: string;
  saldo: number;
  ultimo_movimiento: string | null;
}

export interface MovimientoPtRow {
  id: string;
  producto_id: string;
  deposito_id: string;
  tipo: string;
  cantidad: number;
  lote_texto: string | null;
  motivo: string | null;
  ocurrido_en: string;
  producto: { nombre: string } | null;
}

/** Tipos de movimiento que el punto de venta puede registrar. */
export const TIPOS_MOVIMIENTO_PT = [
  { value: 'ENTRADA_DEVOLUCION', label: 'Entra — envío desde planta o devolución' },
  { value: 'SALIDA_VENTA', label: 'Sale — venta' },
  { value: 'ENTRADA_AJUSTE', label: 'Entra — ajuste de inventario' },
  { value: 'SALIDA_AJUSTE', label: 'Sale — ajuste de inventario' },
  { value: 'SALIDA_DESCARTE', label: 'Sale — descarte' },
] as const;

/** Tipos que la base exige justificar con motivo. */
export const TIPOS_PT_CON_MOTIVO = ['ENTRADA_AJUSTE', 'SALIDA_AJUSTE', 'SALIDA_DESCARTE'];

/* ------------------------------------------------------------------------- *
 * Acceso a tablas que los tipos generados todavía no describen
 * ------------------------------------------------------------------------- */

function tablaComercial<T>(nombre: string): ConsultaTabla<T> {
  const cliente = comercial();
  const desde = cliente.from.bind(cliente) as unknown as (tabla: string) => unknown;
  return desde(nombre) as ConsultaTabla<T>;
}

function tablaGmp<T>(nombre: string): ConsultaTabla<T> {
  const cliente = gmp();
  const desde = cliente.from.bind(cliente) as unknown as (tabla: string) => unknown;
  return desde(nombre) as ConsultaTabla<T>;
}

/* ------------------------------------------------------------------------- *
 * Pedidos
 * ------------------------------------------------------------------------- */

export function usePedidos() {
  return useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => {
      const { data, error } = await tablaComercial<PedidoRow[]>('pedidos')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePedido(id: string | undefined) {
  return useQuery({
    queryKey: ['pedido', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await tablaComercial<PedidoRow>('pedidos')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as PedidoRow;
    },
  });
}

export function useRenglonesPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['pedido-renglones', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<PedidoRenglonRow[]>('pedido_renglones')
        .select('*, producto:productos(nombre)')
        .eq('pedido_id', pedidoId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Explosión del pedido contra el stock disponible.
 *
 * Devuelve **solo lo que falta**, por diseño de `comercial.explotar_pedido`:
 * «una lista donde el 90 % de los renglones dice "hay" entierra los tres que
 * importan». Si vuelve vacía, el pedido se puede fabricar con lo que hay.
 */
export function useFaltantesPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['pedido-faltantes', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      // `database.types.ts` todavía no conoce esta función (misma deuda que
      // los tipos de fila de arriba), así que el cliente no la deja nombrar.
      const cliente = comercial();
      const rpc = cliente.rpc.bind(cliente) as unknown as (
        nombre: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: RenglonFaltante[] | null; error: Error | null }>;

      const { data, error } = await rpc('explotar_pedido', { p_pedido_id: pedidoId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCrearPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      numero: string;
      cliente: string;
      fechaEntrega: string | null;
      observaciones: string | null;
    }) => {
      const { data, error } = await tablaComercial<PedidoRow>('pedidos')
        .insert({
          numero: p.numero,
          cliente: p.cliente,
          fecha_entrega: p.fechaEntrega,
          observaciones: p.observaciones,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PedidoRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
      avisarExito('Pedido creado en borrador.');
    },
    onError: avisarError,
  });
}

export function useAgregarRenglonPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { pedidoId: string; productoId: string; cantidad: number }) => {
      const { error } = await tablaComercial<PedidoRenglonRow>('pedido_renglones').insert(
        {
          pedido_id: r.pedidoId,
          producto_id: r.productoId,
          cantidad: r.cantidad,
        },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['pedido-renglones', v.pedidoId] });
      void qc.invalidateQueries({ queryKey: ['pedido-faltantes', v.pedidoId] });
      avisarExito('Producto agregado al pedido.');
    },
    onError: avisarError,
  });
}

export function useCambiarEstadoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedido }) => {
      const { error } = await tablaComercial<PedidoRow>('pedidos')
        .update({ estado })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
      void qc.invalidateQueries({ queryKey: ['pedido', v.id] });
      avisarExito('Estado del pedido actualizado.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Lista de materiales de acondicionamiento
 *
 * La otra mitad de la lista de materiales: la fórmula cubre el granel, esto
 * cubre envase, tapa y etiqueta. Es lo que carga Gerencia de Producción.
 * ------------------------------------------------------------------------- */

export function useMaterialesDeProducto(productoId: string | undefined) {
  return useQuery({
    queryKey: ['materiales-acondicionamiento', productoId],
    enabled: Boolean(productoId),
    queryFn: async () => {
      const { data, error } = await tablaGmp<MaterialAcondicionamientoRow[]>(
        'materiales_acondicionamiento',
      )
        .select('*, insumo:insumos_catalogo(nombre, codigo_interno, unidad_medida)')
        .eq('producto_id', productoId!)
        .order('creado_en');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgregarMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      productoId: string;
      insumoId: string;
      cantidadPorUnidad: number;
      merma: number;
    }) => {
      const { error } = await tablaGmp<MaterialAcondicionamientoRow>(
        'materiales_acondicionamiento',
      ).insert({
        producto_id: m.productoId,
        insumo_id: m.insumoId,
        cantidad_por_unidad: m.cantidadPorUnidad,
        merma: m.merma,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({
        queryKey: ['materiales-acondicionamiento', v.productoId],
      });
      avisarExito('Material agregado a la lista.');
    },
    onError: avisarError,
  });
}

export function useQuitarMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productoId: string }) => {
      const { error } = await tablaGmp<null>('materiales_acondicionamiento')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({
        queryKey: ['materiales-acondicionamiento', v.productoId],
      });
      avisarExito('Material quitado.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Punto de venta (Calle 5)
 * ------------------------------------------------------------------------- */

export function useStockPuntoVenta() {
  return useQuery({
    queryKey: ['stock-punto-venta'],
    queryFn: async () => {
      const { data, error } = await tablaComercial<StockPuntoVentaRow[]>('v_stock_pt')
        .select('*')
        .order('producto');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMovimientosPuntoVenta(depositoId: string | undefined) {
  return useQuery({
    queryKey: ['movimientos-pt', depositoId],
    enabled: Boolean(depositoId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<MovimientoPtRow[]>('movimientos_pt')
        .select('*, producto:productos(nombre)')
        .eq('deposito_id', depositoId!)
        .order('ocurrido_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Registra un movimiento en el punto de venta.
 *
 * El signo lo pone esta función según el tipo, no el formulario: la base exige
 * que el signo concuerde con el tipo, y pedirle a quien atiende el local que
 * escriba «-3» para una venta es pedirle que recuerde una convención interna.
 */
export function useRegistrarMovimientoPt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      productoId: string;
      depositoId: string;
      tipo: string;
      cantidad: number;
      loteTexto: string | null;
      motivo: string | null;
    }) => {
      const sale = m.tipo.startsWith('SALIDA');
      const { error } = await tablaComercial<MovimientoPtRow>('movimientos_pt').insert({
        producto_id: m.productoId,
        deposito_id: m.depositoId,
        tipo: m.tipo,
        cantidad: sale ? -Math.abs(m.cantidad) : Math.abs(m.cantidad),
        lote_texto: m.loteTexto,
        motivo: m.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-punto-venta'] });
      void qc.invalidateQueries({ queryKey: ['movimientos-pt'] });
      avisarExito('Movimiento registrado.');
    },
    onError: avisarError,
  });
}
