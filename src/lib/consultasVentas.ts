/**
 * Central de pedidos de Ventas (20261001130000 a 160300, lista 46.14 en 140000).
 *
 * Tipado desde los tipos generados (CLAUDE.md §6). Las vistas salen con todas
 * sus columnas `| null` en los tipos de PostgREST: las filas se normalizan acá
 * (números como número, texto vacío en lugar de null donde la base no lo deja
 * nulo) y lo que el CHECK de la base fija se angosta (estado del pago).
 *
 * La base es la autoridad del precio (comercial.recalcular_venta); `calcularVenta`
 * repite la misma cuenta para que la planilla muestre el total mientras se
 * escribe, antes de guardar.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { comercial } from './supabase';

type Vistas = Database['comercial']['Views'];
type Tablas = Database['comercial']['Tables'];

/** Una fila de vista con sus columnas obligatorias sin null (las de `Nulas` quedan como vienen). */
type SinNulos<T, Nulas extends keyof T = never> = {
  [K in keyof T]-?: K extends Nulas ? T[K] : NonNullable<T[K]>;
};

export type FilaLista = SinNulos<
  Vistas['v_lista_mayorista']['Row'],
  'rubro' | 'orden_lista' | 'minimo'
>;
export type Escalon = Pick<
  SinNulos<Vistas['v_escala_descuento']['Row']>,
  'desde_monto' | 'porcentaje'
>;
export type Disponible = SinNulos<Vistas['v_disponible_calle5']['Row']>;

/** Valores del CHECK de `comercial.pedidos.estado_pago`. */
export type EstadoPago = 'NO_PAGO' | 'PARCIAL' | 'PAGO';

type FilaVentaRow = Vistas['v_ventas']['Row'];
type NulasVenta =
  | 'cliente_id'
  | 'fecha_entrega'
  | 'forma_pago'
  | 'destino_envio'
  | 'observaciones'
  | 'gestionado_por'
  | 'gestionado'
  | 'descuento_pct'
  | 'stock_ok'
  | 'stock_nota'
  | 'stock_ok_en'
  | 'pedido_stock_id'
  | 'pedido_stock'
  | 'pedido_stock_estado'
  | 'factura_tipo'
  | 'factura_punto_venta'
  | 'factura_numero'
  | 'entregado_en';
export type FilaVenta = Omit<SinNulos<FilaVentaRow, NulasVenta>, 'estado_pago'> & {
  estado_pago: EstadoPago;
};

export type RenglonVenta = Pick<
  Tablas['pedido_renglones']['Row'],
  | 'id'
  | 'producto_id'
  | 'cantidad'
  | 'precio_base'
  | 'precio_final'
  | 'precio_manual'
  | 'de_calle5'
  | 'a_producir'
  | 'anulado'
>;

/** Formas de pago que usa la planilla PEDIDOS MAYORISTAS. Se puede escribir otra. */
export const FORMAS_PAGO = [
  'Transferencia a Nail Show',
  'Transferencia a Athene',
  'Transferencia PF',
  'Efectivo',
  'Cheque',
  'Cuenta corriente',
];

export const TEXTO_PAGO: Record<EstadoPago, string> = {
  NO_PAGO: 'No pagó',
  PARCIAL: 'Pagó una parte',
  PAGO: 'Pagó',
};

const ESTADOS_PAGO: EstadoPago[] = ['NO_PAGO', 'PARCIAL', 'PAGO'];
const aEstadoPago = (x: string | null): EstadoPago =>
  ESTADOS_PAGO.includes(x as EstadoPago) ? (x as EstadoPago) : 'NO_PAGO';

const n = (x: unknown) => Number(x ?? 0);

/* ------------------------------ La cuenta ------------------------------ */

/** Porcentaje de la escala para un monto (espejo de comercial.descuento_por_monto). */
export function descuentoPorMonto(monto: number, escala: Escalon[]): number {
  let pct = 0;
  for (const e of [...escala].sort((a, b) => a.desde_monto - b.desde_monto))
    if (monto >= e.desde_monto) pct = e.porcentaje;
  return pct;
}

/** El escalón siguiente: cuánto falta para el próximo descuento. */
export function proximoEscalon(monto: number, escala: Escalon[]) {
  const sig = [...escala]
    .sort((a, b) => a.desde_monto - b.desde_monto)
    .find((e) => e.desde_monto > monto);
  return sig ? { falta: sig.desde_monto - monto, porcentaje: sig.porcentaje } : null;
}

export interface LineaCuenta {
  cantidad: number;
  /** Precio con promoción por unidad (columna G). */
  precio_promo: number;
  unidades_pack: number;
  /** Precio por unidad del código escrito a mano (con IVA), o null. */
  manual: number | null;
}

/**
 * La cuenta de la planilla: total de lista = Σ cantidad × pack × precio con
 * promo (H341); descuento según la escala, o el fijado (H342); precio final
 * por unidad redondeado a pesos (columna I); total con descuento.
 */
export function calcularVenta(
  lineas: LineaCuenta[],
  escala: Escalon[],
  descuentoFijo: number | null,
) {
  const lista = lineas.reduce(
    (a, l) => a + l.cantidad * l.unidades_pack * l.precio_promo,
    0,
  );
  const descuento = descuentoFijo ?? descuentoPorMonto(lista, escala);
  const finales = lineas.map((l) =>
    l.manual !== null
      ? l.manual
      : Math.round(l.precio_promo * (1 - descuento / 100)) * l.unidades_pack,
  );
  const total = lineas.reduce((a, l, i) => a + l.cantidad * finales[i]!, 0);
  return { lista, descuento, finales, total };
}

/* ------------------------------- Lecturas ------------------------------ */

export function useListaMayorista() {
  return useQuery({
    queryKey: ['lista-mayorista'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FilaLista[]> => {
      const { data, error } = await comercial()
        .from('v_lista_mayorista')
        .select('*')
        .order('orden_lista', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        producto_id: f.producto_id ?? '',
        codigo_interno: f.codigo_interno ?? '',
        producto: f.producto ?? '',
        numero_lista: f.numero_lista ?? '',
        rubro: f.rubro,
        orden_lista: f.orden_lista,
        precio_lista: n(f.precio_lista),
        precio_promo: n(f.precio_promo),
        precio_base: n(f.precio_base),
        unidades_pack: n(f.unidades_pack) || 1,
        minimo: f.minimo,
        es_regalo: f.es_regalo ?? false,
        alicuota_iva: n(f.alicuota_iva),
        vigente_desde: f.vigente_desde ?? '',
      }));
    },
  });
}

export function useEscalaDescuento() {
  return useQuery({
    queryKey: ['escala-descuento'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Escalon[]> => {
      const { data, error } = await comercial().from('v_escala_descuento').select('*');
      if (error) throw error;
      return (data ?? []).map((e) => ({
        desde_monto: n(e.desde_monto),
        porcentaje: n(e.porcentaje),
      }));
    },
  });
}

export function useDisponibleCalle5() {
  return useQuery({
    queryKey: ['disponible-calle5'],
    queryFn: async () => {
      const { data, error } = await comercial().from('v_disponible_calle5').select('*');
      if (error) throw error;
      return new Map<string, Disponible>(
        (data ?? []).map((d) => [
          d.producto_id ?? '',
          {
            producto_id: d.producto_id ?? '',
            en_calle5: n(d.en_calle5),
            reservado: n(d.reservado),
            tomado_sin_reservar: n(d.tomado_sin_reservar),
            disponible: n(d.disponible),
          },
        ]),
      );
    },
  });
}

const aFilaVenta = (v: FilaVentaRow): FilaVenta => ({
  ...v,
  id: v.id ?? '',
  numero: v.numero ?? '',
  fecha: v.fecha ?? '',
  cliente: v.cliente ?? '',
  estado: v.estado ?? 'BORRADOR',
  estado_pago: aEstadoPago(v.estado_pago),
  descuento_pct: v.descuento_pct === null ? null : n(v.descuento_pct),
  descuento_aplicado: n(v.descuento_aplicado),
  importe_lista: n(v.importe_lista),
  importe_total: n(v.importe_total),
  productos: n(v.productos),
  a_producir: n(v.a_producir),
  pendiente: n(v.pendiente),
  despachado: n(v.despachado),
  reservar_calle5: v.reservar_calle5 ?? false,
  creado_en: v.creado_en ?? '',
});

export function useVentas() {
  return useQuery({
    queryKey: ['ventas'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_ventas')
        .select('*')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(aFilaVenta);
    },
  });
}

export function useVenta(id: string | undefined) {
  return useQuery({
    queryKey: ['venta', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_ventas')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      const { data: rs, error: e2 } = await comercial()
        .from('pedido_renglones')
        .select(
          'id, producto_id, cantidad, precio_base, precio_final, precio_manual, de_calle5, a_producir, anulado',
        )
        .eq('pedido_id', id!)
        .eq('anulado', false);
      if (e2) throw e2;
      return {
        venta: aFilaVenta(data),
        renglones: (rs ?? []).map((r) => ({
          ...r,
          cantidad: n(r.cantidad),
          precio_base: r.precio_base === null ? null : n(r.precio_base),
          precio_final: r.precio_final === null ? null : n(r.precio_final),
          de_calle5: r.de_calle5 === null ? null : n(r.de_calle5),
          a_producir: r.a_producir === null ? null : n(r.a_producir),
        })),
      };
    },
  });
}

/* ------------------------------ Escrituras ----------------------------- */

const invalidar = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of [
    'ventas',
    'venta',
    'pedidos',
    'pedido',
    'disponible-calle5',
    'calle5',
    'pendientes-despacho',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
};

export type CabeceraVenta = Pick<
  Tablas['pedidos']['Update'],
  | 'cliente'
  | 'cliente_id'
  | 'fecha_entrega'
  | 'forma_pago'
  | 'destino_envio'
  | 'observaciones'
  | 'descuento_pct'
  | 'gestionado_por'
> & { cliente: string };

export interface LineaGuardar {
  producto_id: string;
  cantidad: number;
  /** Precio por unidad del código con IVA, escrito a mano; null = el de la lista. */
  manual: number | null;
}

/**
 * Guarda el borrador: cabecera y renglones. Lo nuevo se inserta, lo que
 * cambió se actualiza y lo que quedó en cero se quita (anulado, no se borra).
 */
export function useGuardarVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      id: string | null;
      cabecera: CabeceraVenta;
      lineas: LineaGuardar[];
      previos: RenglonVenta[];
    }) => {
      let id = d.id;
      if (!id) {
        const previos = await comercial().from('pedidos').select('numero');
        const max = (previos.data ?? []).reduce((m, r) => {
          const x = /^V-(\d+)$/.exec(r.numero);
          return x ? Math.max(m, Number(x[1])) : m;
        }, 0);
        const { data, error } = await comercial()
          .from('pedidos')
          .insert({
            numero: `V-${String(max + 1).padStart(4, '0')}`,
            es_venta: true,
            ...d.cabecera,
          })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await comercial()
          .from('pedidos')
          .update(d.cabecera)
          .eq('id', id);
        if (error) throw error;
      }
      const porProducto = new Map(d.previos.map((r) => [r.producto_id, r]));
      for (const l of d.lineas) {
        const previo = porProducto.get(l.producto_id);
        const precio =
          l.manual === null
            ? { precio_manual: false }
            : { precio_manual: true, precio_final: l.manual };
        if (!previo && l.cantidad > 0) {
          const { error } = await comercial()
            .from('pedido_renglones')
            .insert({
              pedido_id: id,
              producto_id: l.producto_id,
              cantidad: l.cantidad,
              ...precio,
            });
          if (error) throw error;
        } else if (previo && l.cantidad <= 0) {
          const { error } = await comercial()
            .from('pedido_renglones')
            .update({ anulado: true })
            .eq('id', previo.id);
          if (error) throw error;
        } else if (
          previo &&
          (previo.cantidad !== l.cantidad ||
            previo.precio_manual !== (l.manual !== null) ||
            (l.manual !== null && previo.precio_final !== l.manual))
        ) {
          const { error } = await comercial()
            .from('pedido_renglones')
            .update({ cantidad: l.cantidad, ...precio })
            .eq('id', previo.id);
          if (error) throw error;
        }
      }
      return id;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Pedido guardado.');
    },
    onError: avisarError,
  });
}

/** Envía el pedido: lo que Ventas toma de Calle 5 queda reservado; lo que falta va a Producción. */
export function useEnviarVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      id: string;
      deCalle5: { producto_id: string; cantidad: number }[];
    }) => {
      const { data, error } = await comercial().rpc('enviar_venta', {
        p_pedido_id: d.id,
        p_de_calle5: d.deCalle5,
      });
      if (error) throw error;
      // La función devuelve jsonb (20261001160300): { a_producir, pedido_stock_id, pedido_stock }.
      return data as { a_producir: number; pedido_stock: string | null };
    },
    onSuccess: (r) => {
      invalidar(qc);
      avisarExito(
        r.pedido_stock
          ? `Pedido enviado. Lo de Calle 5 quedó reservado; lo que falta va a Producción en ${r.pedido_stock}.`
          : 'Pedido enviado. Todo sale de Calle 5 y quedó reservado.',
      );
    },
    onError: avisarError,
  });
}

/**
 * «Enviado» de la encargada de Calle 5: despacha lo que sale (la base elige los
 * lotes con gmp.lote_despachable) y, si difiere de lo pendiente, registra qué
 * se pedía y qué salió con el motivo.
 */
export function useEnviarArmado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      id: string;
      renglones: { producto_id: string; cantidad: number }[];
      motivo: string | null;
    }) => {
      const { error } = await comercial().rpc('enviar_armado', {
        p_pedido_id: d.id,
        p_renglones: d.renglones,
        ...(d.motivo ? { p_motivo: d.motivo } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Enviado. El stock de Calle 5 ya está descontado.');
    },
    onError: avisarError,
  });
}

/** Columnas que se cambian desde la grilla (pago, forma de pago, destino, observación). */
export function useActualizarVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      id: string;
      cambios: Pick<
        Tablas['pedidos']['Update'],
        'estado_pago' | 'forma_pago' | 'destino_envio' | 'observaciones'
      >;
    }) => {
      const { error } = await comercial()
        .from('pedidos')
        .update(d.cambios)
        .eq('id', d.id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useVerificarStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; ok: boolean; nota: string | null }) => {
      const { error } = await comercial().rpc('verificar_stock_pedido', {
        p_pedido_id: d.id,
        p_ok: d.ok,
        ...(d.nota ? { p_nota: d.nota } : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_, d) => {
      invalidar(qc);
      avisarExito(
        d.ok
          ? 'Marcado: hay stock.'
          : 'Marcado: falta stock. Ventas lo ve en la central.',
      );
    },
    onError: avisarError,
  });
}

/** Cambiar la escala de descuento por monto: se carga entera, con la fecha desde la que rige. */
export function useCargarEscala() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { escalones: Escalon[]; vigenteDesde: string }) => {
      const { error } = await comercial().rpc('cargar_escala_descuento', {
        p_escalones: d.escalones,
        p_vigente_desde: d.vigenteDesde,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['escala-descuento'] });
      void qc.invalidateQueries({ queryKey: ['ventas'] });
      avisarExito('Escala nueva cargada. La anterior queda en el historial.');
    },
    onError: avisarError,
  });
}
