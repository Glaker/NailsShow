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
import { comercial, core, gmp } from './supabase';
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
  /** Cliente del padrón (20260924130000). Obligatorio para facturar. */
  cliente_id: string | null;
  /** Cliente tercerizado (20260924150200). Nulo = pedido de Nail Show. */
  tercero_id: string | null;
  creado_por: string;
  creado_en: string;
}

export interface PedidoConConteoRow extends PedidoRow {
  renglones: { count: number }[];
}

export interface PedidoRenglonRow {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  /** Precio unitario NETO de IVA (20260924130000). Null = sin precio todavía. */
  precio_unitario: number | null;
  alicuota_iva: number;
}

export type EstadoAviso = 'PENDIENTE' | 'EN_COMPRA' | 'RESUELTO' | 'DESCARTADO';

export interface AvisoCompraRow {
  id: string;
  pedido_id: string | null;
  insumo_id: string;
  cantidad: number;
  unidad: string;
  proveedor_id: string | null;
  fecha_limite: string | null;
  estado: EstadoAviso;
  nota: string | null;
  creado_en: string;
  resuelto_por: string | null;
  resuelto_en: string | null;
  pedido: { numero: string; cliente: string } | null;
}

/** Una fila de `comercial.faltantes_en_curso()`: faltante sumando pedidos. */
export interface FaltanteConsolidado {
  insumo_id: string;
  codigo_interno: string | null;
  insumo: string;
  unidad: string | null;
  necesario: number;
  disponible: number;
  saldo_apertura: number;
  faltante: number;
  proveedor_id: string | null;
  proveedor: string | null;
  proveedor_estado: string | null;
  pedidos: {
    pedido_id: string;
    numero: string;
    cliente: string;
    fecha_entrega: string | null;
    necesario: number;
  }[];
}

export interface PedidoConsumoRow {
  id: string;
  pedido_id: string;
  insumo_id: string;
  unidad: string;
  cantidad_teorica: number;
  cantidad_real: number;
  motivo_diferencia: string | null;
  registrado_por: string;
  registrado_en: string;
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

/**
 * Roles que `pedidos_escribe` / `pedidos_actualiza` dejan pasar. Espejo de la
 * política, no un control: la base rechaza igual a quien no esté acá.
 */
export const ROLES_ESCRIBEN_PEDIDOS = [
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
] as const;

/** Mismos tres roles en `avisos_escribe` / `avisos_actualiza`. */
export const ROLES_ESCRIBEN_AVISOS = ROLES_ESCRIBEN_PEDIDOS;

/**
 * Quién termina un pedido: el chequeo de `comercial.terminar_pedido()` y la
 * política de `pedido_consumos` (§3.3, Gerencia de Producción; DT supervisa).
 */
export const ROLES_TERMINAN_PEDIDOS = [
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
] as const;

function rpcComercial<T>(fn: string, args: Record<string, unknown>) {
  const cliente = comercial();
  const rpc = cliente.rpc.bind(cliente) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: T | null; error: Error | null }>;
  return rpc(fn, args);
}

export function usePedidos() {
  return useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => {
      // `renglones(count)` resuelve dentro del mismo esquema: es un agregado de
      // PostgREST, no una consulta por fila.
      const { data, error } = await tablaComercial<PedidoConConteoRow[]>('pedidos')
        .select('*, renglones:pedido_renglones(count)')
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

/**
 * Renglones del pedido, sin el producto embebido.
 *
 * `pedido_renglones` vive en `comercial` y `productos` en `gmp`: el nombre se
 * resuelve en la pantalla contra `useProductos()`, que ya está en caché, en vez
 * de depender de un embebido entre esquemas.
 */
export function useRenglonesPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['pedido-renglones', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<PedidoRenglonRow[]>('pedido_renglones')
        .select('*')
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
      const cliente = comercial();
      const rpc = cliente.rpc.bind(cliente) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: RenglonFaltante[] | null; error: Error | null }>;

      const { data, error } = await rpc('explotar_pedido', { p_pedido_id: pedidoId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Qué productos del pedido tienen lista de materiales activa.
 *
 * La explosión no puede avisar lo que no sabe: un producto sin lista no genera
 * faltantes, y sin esta consulta la pantalla diría «se puede fabricar» cuando
 * la respuesta honesta es «no se sabe».
 */
export function useProductosConLista(productoIds: string[]) {
  const clave = [...productoIds].sort();
  return useQuery({
    queryKey: ['productos-con-lista', clave],
    enabled: clave.length > 0,
    queryFn: async () => {
      const { data, error } = await tablaGmp<{ producto_id: string }[]>(
        'materiales_acondicionamiento',
      )
        .select('producto_id')
        .eq('activo', true)
        .in('producto_id', clave);
      if (error) throw error;
      return new Set((data ?? []).map((m) => m.producto_id));
    },
  });
}

/**
 * Alta de pedido con sus renglones.
 *
 * Son dos llamadas porque PostgREST no da transacción entre ellas (ver
 * «Trampas conocidas» en ESTADO.md). El orden elegido acota el daño: primero la
 * cabecera en BORRADOR, después todos los renglones en **un solo INSERT**, que
 * sí es atómico. Si ese falla, lo que queda es un borrador sin productos, que
 * no dispara nada y se completa desde su ficha; nunca un pedido confirmado a
 * medias. Recién con los renglones escritos se confirma, si se pidió.
 */
export function useRegistrarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      numero: string;
      cliente: string;
      clienteId: string | null;
      terceroId: string | null;
      fechaEntrega: string | null;
      observaciones: string | null;
      renglones: {
        productoId: string;
        cantidad: number;
        precioUnitario: number | null;
        alicuotaIva: number;
      }[];
      confirmar: boolean;
    }): Promise<{ pedido: PedidoRow; falla: string | null }> => {
      const { data, error } = await tablaComercial<PedidoRow>('pedidos')
        .insert({
          numero: p.numero,
          cliente: p.cliente,
          cliente_id: p.clienteId,
          tercero_id: p.terceroId,
          fecha_entrega: p.fechaEntrega,
          observaciones: p.observaciones,
        })
        .select()
        .single();
      if (error) throw error;
      const pedido = data as PedidoRow;

      if (p.renglones.length > 0) {
        const { error: errRenglones } = await tablaComercial<null>(
          'pedido_renglones',
        ).insert(
          p.renglones.map((r) => ({
            pedido_id: pedido.id,
            producto_id: r.productoId,
            cantidad: r.cantidad,
            precio_unitario: r.precioUnitario,
            alicuota_iva: r.alicuotaIva,
          })),
        );
        if (errRenglones) {
          return {
            pedido,
            falla: `El pedido quedó en borrador pero los productos no se guardaron: ${errRenglones.message}`,
          };
        }
      }

      if (p.confirmar) {
        const { data: act, error: errEstado } = await tablaComercial<PedidoRow[]>(
          'pedidos',
        )
          .update({ estado: 'CONFIRMADO' })
          .eq('id', pedido.id)
          .select('id');
        if (errEstado || !act || act.length === 0) {
          return {
            pedido,
            falla: `El pedido quedó guardado en borrador, pero no se pudo enviar a producción${errEstado ? `: ${errEstado.message}` : '.'}`,
          };
        }
      }

      return { pedido, falla: null };
    },
    onSuccess: ({ falla }, v) => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
      if (falla) {
        avisarError(new Error(falla));
      } else {
        avisarExito(
          v.confirmar ? 'Pedido enviado a producción.' : 'Pedido guardado en borrador.',
        );
      }
    },
    onError: avisarError,
  });
}

function invalidarPedido(qc: ReturnType<typeof useQueryClient>, pedidoId: string) {
  void qc.invalidateQueries({ queryKey: ['pedidos'] });
  void qc.invalidateQueries({ queryKey: ['pedido', pedidoId] });
  void qc.invalidateQueries({ queryKey: ['pedido-renglones', pedidoId] });
  void qc.invalidateQueries({ queryKey: ['pedido-faltantes', pedidoId] });
  void qc.invalidateQueries({ queryKey: ['productos-con-lista'] });
  void qc.invalidateQueries({ queryKey: ['faltantes-en-curso'] });
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
      invalidarPedido(qc, v.pedidoId);
      avisarExito('Producto agregado al pedido.');
    },
    onError: avisarError,
  });
}

/**
 * Un UPDATE o DELETE que RLS filtra no falla: afecta cero filas. Por eso las
 * mutaciones piden la fila de vuelta y tratan «nada» como error, igual que
 * `useLevantarBloqueo`.
 */
function exigirFila(data: unknown[] | null, accion: string) {
  if (!data || data.length === 0) {
    throw new Error(
      `No se pudo ${accion}: tu usuario no tiene permiso sobre este pedido.`,
    );
  }
}

export function useCambiarCantidadRenglon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id: string; pedidoId: string; cantidad: number }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('pedido_renglones')
        .update({ cantidad: r.cantidad })
        .eq('id', r.id)
        .select('id');
      if (error) throw error;
      exigirFila(data, 'cambiar la cantidad');
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.pedidoId);
      avisarExito('Cantidad actualizada.');
    },
    onError: avisarError,
  });
}

/** Precio y alícuota de un renglón. La base solo lo deja en borrador. */
export function useCambiarPrecioRenglon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      id: string;
      pedidoId: string;
      precioUnitario: number | null;
      alicuotaIva: number;
    }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('pedido_renglones')
        .update({ precio_unitario: r.precioUnitario, alicuota_iva: r.alicuotaIva })
        .eq('id', r.id)
        .select('id');
      if (error) throw error;
      exigirFila(data, 'cambiar el precio');
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.pedidoId);
      avisarExito('Precio actualizado.');
    },
    onError: avisarError,
  });
}

/**
 * Cliente del padrón del pedido. La base lo deja asignar aunque el pedido esté
 * cerrado, pero una sola vez: completa el dato que la factura necesita.
 */
export function useAsignarClientePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { pedidoId: string; clienteId: string }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('pedidos')
        .update({ cliente_id: a.clienteId })
        .eq('id', a.pedidoId)
        .select('id');
      if (error) throw error;
      exigirFila(data, 'asignar el cliente');
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.pedidoId);
      avisarExito('Cliente asignado al pedido.');
    },
    onError: avisarError,
  });
}

export function useQuitarRenglon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id: string; pedidoId: string }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('pedido_renglones')
        .delete()
        .eq('id', r.id)
        .select('id');
      if (error) throw error;
      exigirFila(data, 'quitar el producto');
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.pedidoId);
      avisarExito('Producto quitado del pedido.');
    },
    onError: avisarError,
  });
}

/**
 * Avance del pedido. La pantalla ofrece solo el paso que corresponde al estado
 * actual (ver `SIGUIENTES_ESTADOS` en la ficha); la base, hoy, admite cualquier
 * cambio entre los cinco valores del enum.
 */
export function useCambiarEstadoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoPedido }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('pedidos')
        .update({ estado })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      exigirFila(data, 'cambiar el estado');
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.id);
      avisarExito(MENSAJE_ESTADO[v.estado]);
    },
    onError: avisarError,
  });
}

const MENSAJE_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: 'El pedido volvió a borrador.',
  CONFIRMADO: 'Pedido enviado a producción.',
  EN_PRODUCCION: 'Pedido en producción.',
  CUMPLIDO: 'Pedido terminado.',
  CANCELADO: 'Pedido cancelado.',
};

/**
 * Productos que tienen lista de materiales activa, para ofrecerlos primero al
 * cargar un pedido. Un producto sin lista se puede pedir igual, pero el
 * sistema no puede decir qué le falta.
 */
export function useProductosConListaCargada() {
  return useQuery({
    queryKey: ['productos-con-lista', 'todos'],
    queryFn: async () => {
      const { data, error } = await tablaGmp<{ producto_id: string }[]>(
        'materiales_acondicionamiento',
      )
        .select('producto_id')
        .eq('activo', true);
      if (error) throw error;
      return new Set((data ?? []).map((m) => m.producto_id));
    },
  });
}

/**
 * Faltantes de todos los pedidos en curso, sumando la necesidad antes de
 * comparar con el disponible (`comercial.faltantes_en_curso`). Sumar los
 * faltantes de cada pedido por separado daría un número falso: cada pedido se
 * explota contra el mismo stock.
 */
export function useFaltantesEnCurso() {
  return useQuery({
    queryKey: ['faltantes-en-curso'],
    queryFn: async () => {
      const { data, error } = await rpcComercial<FaltanteConsolidado[]>(
        'faltantes_en_curso',
        {},
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Lo que la lista de materiales dice que consume el pedido (teórico). */
export function useNecesidadPedido(pedidoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['pedido-necesidad', pedidoId],
    enabled: Boolean(pedidoId) && habilitado,
    queryFn: async () => {
      const { data, error } = await rpcComercial<
        { insumo_id: string; necesario: number }[]
      >('necesidad_pedido', { p_pedido_id: pedidoId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConsumosPedido(pedidoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['pedido-consumos', pedidoId],
    enabled: Boolean(pedidoId) && habilitado,
    queryFn: async () => {
      const { data, error } = await tablaComercial<PedidoConsumoRow[]>('pedido_consumos')
        .select('*')
        .eq('pedido_id', pedidoId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * «Terminado»: registra lo consumido, baja el stock lote por lote y cierra el
 * pedido, en una sola transacción de base (`comercial.terminar_pedido`). Solo
 * se mandan los insumos cuya cantidad difiere de la receta o que no estaban en
 * ella; el resto la base lo toma con su cantidad teórica.
 */
export function useTerminarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      pedidoId: string;
      correcciones: {
        insumoId: string;
        cantidad: number;
        motivo: string | null;
        /** Solo en pedidos tercerizados, si salió de otro stock que el elegido. */
        origen?: 'NAILSHOW' | 'TERCERO';
      }[];
    }) => {
      const { error } = await rpcComercial<null>('terminar_pedido', {
        p_pedido_id: t.pedidoId,
        p_consumos: t.correcciones.map((c) => ({
          insumo_id: c.insumoId,
          cantidad: c.cantidad,
          motivo: c.motivo,
          ...(c.origen ? { origen: c.origen } : {}),
        })),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidarPedido(qc, v.pedidoId);
      void qc.invalidateQueries({ queryKey: ['pedido-consumos', v.pedidoId] });
      void qc.invalidateQueries({ queryKey: ['faltantes-en-curso'] });
      for (const k of [
        'stock-articulos',
        'stock-existencias',
        'stock-lote',
        'kardex',
        'kardex-general',
      ])
        void qc.invalidateQueries({ queryKey: [k] });
      avisarExito('Pedido terminado. El stock se descontó.');
    },
    onError: avisarError,
  });
}

/**
 * Nombres de la nómina, para decir quién cargó el pedido o resolvió la compra.
 * `core.v_nomina` la lee cualquier usuario con sesión; `core.usuarios`, no.
 */
export function useNomina() {
  return useQuery({
    queryKey: ['nomina'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await core().from('v_nomina').select('id, nombre_completo');
      if (error) throw error;
      return new Map(
        (data ?? [])
          .filter((u) => u.id)
          .map((u) => [u.id as string, u.nombre_completo ?? '—']),
      );
    },
  });
}

/* ------------------------------------------------------------------------- *
 * Avisos de compra
 *
 * El aviso es la fila que sobrevive a la pantalla: la explosión del pedido se
 * recalcula cada vez que se abre, y lo que se decidió comprar tiene que poder
 * preguntarse dentro de tres semanas.
 * ------------------------------------------------------------------------- */

export function useAvisosCompra() {
  return useQuery({
    queryKey: ['avisos-compra'],
    queryFn: async () => {
      const { data, error } = await tablaComercial<AvisoCompraRow[]>('avisos_compra')
        .select('*, pedido:pedidos(numero, cliente)')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAnotarCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      avisos: {
        pedidoId: string;
        insumoId: string;
        cantidad: number;
        unidad: string;
        proveedorId: string | null;
        fechaLimite: string | null;
      }[],
    ) => {
      const { error } = await tablaComercial<null>('avisos_compra').insert(
        avisos.map((a) => ({
          pedido_id: a.pedidoId,
          insumo_id: a.insumoId,
          cantidad: a.cantidad,
          unidad: a.unidad,
          proveedor_id: a.proveedorId,
          fecha_limite: a.fechaLimite,
        })),
      );
      if (error) throw error;
      return avisos.length;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ['avisos-compra'] });
      avisarExito(
        n === 1
          ? 'Anotado en compras pendientes.'
          : `${n} insumos anotados en compras pendientes.`,
      );
    },
    onError: avisarError,
  });
}

export function useCambiarEstadoAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      id: string;
      estado: EstadoAviso;
      usuarioId: string | null;
      nota?: string | null;
    }) => {
      const cierra = a.estado === 'RESUELTO' || a.estado === 'DESCARTADO';
      const cambios: Record<string, unknown> = { estado: a.estado };
      // `resuelto_por` no tiene default ni trigger que lo llene: lo pone la
      // pantalla desde la sesión. El autor real queda igual en core.auditoria.
      if (cierra) {
        cambios.resuelto_por = a.usuarioId;
        cambios.resuelto_en = new Date().toISOString();
      }
      if (a.nota !== undefined) cambios.nota = a.nota;

      const { data, error } = await tablaComercial<{ id: string }[]>('avisos_compra')
        .update(cambios)
        .eq('id', a.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'No se pudo actualizar: tu usuario no tiene permiso sobre compras.',
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['avisos-compra'] });
      avisarExito('Compra actualizada.');
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

/* ------------------------------------------------------------------------- *
 * Conteo de inventario
 *
 * El conteo lleva el saldo de un insumo a lo contado con un ajuste sobre su
 * lote de saldo de apertura (`comercial.registrar_conteo`). Los lotes con
 * recepción no se tocan desde acá.
 * ------------------------------------------------------------------------- */

export interface UltimoConteoRow {
  insumo_id: string;
  conteo_id: string;
  cantidad_contada: number;
  unidad: string;
  provisorio: boolean;
  registrado_en: string;
  registrado_por: string;
  registrado_por_nombre: string | null;
}

/** Roles de `conteos_inventario_insert_stock` y de `registrar_conteo()`. */
export const ROLES_CUENTAN = [
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
] as const;

export function useUltimosConteos() {
  return useQuery({
    queryKey: ['ultimos-conteos'],
    queryFn: async () => {
      const { data, error } =
        await tablaComercial<UltimoConteoRow[]>('v_ultimo_conteo').select('*');
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.insumo_id, c]));
    },
  });
}

export function useRegistrarConteo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      insumoId: string;
      cantidad: number;
      observacion: string | null;
    }) => {
      const { data, error } = await rpcComercial<number>('registrar_conteo', {
        p_insumo_id: c.insumoId,
        p_cantidad: c.cantidad,
        p_observacion: c.observacion,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      for (const k of [
        'ultimos-conteos',
        'stock-articulos',
        'stock-existencias',
        'stock-lote',
        'kardex',
        'kardex-general',
        'faltantes-en-curso',
        'pedido-faltantes',
      ])
        void qc.invalidateQueries({ queryKey: [k] });
      avisarExito('Conteo registrado.');
    },
    onError: avisarError,
  });
}
