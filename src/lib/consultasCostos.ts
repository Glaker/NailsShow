/**
 * Módulo de costos, Fase 1 (20261009120000 a 20261009120400).
 *
 * Costeo de GESTIÓN: sirve para conocer el costo real y fijar precios. No es
 * la valuación contable de inventario (R-10, docs/DECISIONES_ABIERTAS.md).
 *
 * PUENTE DE TIPOS. Las tablas y vistas de costos no están todavía en
 * `database.types.ts`: se generan con `npm run db:types` cuando la migración
 * esté aplicada. Hasta entonces las filas se describen acá abajo, a mano y
 * calcadas de la migración. Al regenerar los tipos, se reemplazan por
 * `Database['comercial'][...]` y se borra `sinTipos`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FINANZAS, type Rol } from '@/features/auth/sesion';
import { avisarError, avisarExito } from './consultas';
import { supabase } from './supabase';

const sinTipos = () => (supabase as unknown as SupabaseClient).schema('comercial');
const gmpSinTipos = () => (supabase as unknown as SupabaseClient).schema('gmp');

// ---------------------------------------------------------------------------
// Quién hace qué: espejo de las políticas (D-38). La autoridad es RLS.
// ---------------------------------------------------------------------------

export const ROLES_VEN_COSTOS: Rol[] = [
  FINANZAS,
  'GERENCIA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
];
export const ROLES_CARGAN_COSTO_LOTE: Rol[] = [
  FINANZAS,
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
];
export const ROLES_MINUTOS: Rol[] = [FINANZAS, 'GERENCIA_PRODUCCION'];
export const ROLES_CONTENIDO_NETO: Rol[] = [
  'DIRECCION_TECNICA',
  'GERENCIA_PRODUCCION',
  'ADMINISTRADOR_SISTEMA',
];

// ---------------------------------------------------------------------------
// Reglas puras, espejo de las funciones de la base (mismos casos en el test)
// ---------------------------------------------------------------------------

export type Comprobante =
  'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'NO_DISCRIMINADO' | 'SIN_COMPROBANTE';

export const COMPROBANTES: { value: Comprobante; label: string }[] = [
  { value: 'FACTURA_A', label: 'Factura A' },
  { value: 'FACTURA_B', label: 'Factura B' },
  { value: 'FACTURA_C', label: 'Factura C' },
  { value: 'NO_DISCRIMINADO', label: 'IVA no discriminado' },
  { value: 'SIN_COMPROBANTE', label: 'Sin comprobante' },
];

export const ALICUOTAS = ['21', '10.5', '27', '0'];
export const UNIDADES_COSTO = ['g', 'kg', 'ml', 'l', 'UNIDAD'];
export type Moneda = 'ARS' | 'USD';

/**
 * Neto en pesos (comercial.importe_neto_ars). Sólo la factura A discrimina IVA
 * recuperable: en cualquier otro comprobante el importe entero es costo.
 */
export function netoArs(
  importe: number,
  comprobante: Comprobante | null,
  incluyeIva: boolean | null,
  alicuota: number | null,
  tipoCambio: number,
): number {
  const neto =
    comprobante === 'FACTURA_A' && incluyeIva
      ? importe / (1 + (alicuota ?? 0) / 100)
      : importe;
  return Math.round(neto * tipoCambio * 10000) / 10000;
}

const UNIDAD: Record<string, { f: number; d: 'M' | 'V' | 'U' }> = {
  g: { f: 1, d: 'M' },
  kg: { f: 1000, d: 'M' },
  ml: { f: 1, d: 'V' },
  l: { f: 1000, d: 'V' },
  unidad: { f: 1, d: 'U' },
};

/** comercial.convertir_cantidad: entre masa y volumen sólo con densidad (g/mL). */
export function convertirCantidad(
  cantidad: number,
  desde: string,
  hacia: string,
  densidad: number | null = null,
): number | null {
  const a = UNIDAD[desde.trim().toLowerCase()];
  const b = UNIDAD[hacia.trim().toLowerCase()];
  if (!a || !b) return null;
  let v = cantidad * a.f;
  if (a.d !== b.d) {
    if (a.d === 'U' || b.d === 'U' || !densidad || densidad <= 0) return null;
    v = a.d === 'M' ? v / densidad : v * densidad;
  }
  return v / b.f;
}

/** Comprobante del costo a partir del que se cargó en la recepción. */
export function comprobanteDeRecepcion(
  tipo: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'SIN_FACTURA',
): Comprobante {
  return tipo === 'SIN_FACTURA' ? 'SIN_COMPROBANTE' : tipo;
}

// ---------------------------------------------------------------------------
// Filas (puente, ver arriba)
// ---------------------------------------------------------------------------

/** ESTIMADO: lo aproximó Gerencia de Producción; vale último (20261021140000). */
export type OrigenReferencia = 'MANUAL' | 'ULTIMO_LOTE' | 'APERTURA' | 'ESTIMADO';

export interface CostoReferencia {
  insumo_id: string;
  codigo_interno: string;
  nombre: string;
  tipo: string;
  unidad_medida: string | null;
  costo_unitario_ars: number | null;
  origen: OrigenReferencia | null;
  fecha: string | null;
  costo_manual: number | null;
  costo_referencia_id: string | null;
  manual_desde: string | null;
  costo_ultimo_lote: number | null;
  ultimo_lote_fecha: string | null;
  costo_apertura: number | null;
  apertura_fecha: string | null;
  /** D-42: fecha anterior al corte o sin fecha. Vale como provisorio. */
  desactualizado: boolean | null;
  /** D-42: por qué un insumo de la planilla de apertura quedó sin costo. */
  pendiente: string | null;
  /** D-42: apertura en dólares, convertida con este tipo de cambio de la serie. */
  tipo_cambio_aplicado: number | null;
  tipo_cambio_mes: string | null;
}

/** Un insumo pendiente de la planilla de apertura, para el Excel a completar (D-42). */
export interface CostoPendiente {
  insumo_id: string;
  codigo_interno: string;
  nombre: string;
  unidad_medida: string | null;
  pendiente: string;
  importe: number | null;
  moneda: Moneda | null;
  cantidad: number | null;
  unidad: string | null;
  fecha_costo: string | null;
  peso_planilla: string | null;
  detalle: string | null;
}

export interface CostoLote {
  id: string;
  lote_insumo_id: string;
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  recepcion_id: string | null;
  fecha_recepcion: string | null;
  proveedor_id: string | null;
  origen: 'RECEPCION' | 'APERTURA';
  tipo_comprobante: Comprobante | null;
  importe: number;
  moneda: Moneda;
  tipo_cambio: number;
  cantidad: number;
  unidad: string;
  fecha_costo: string | null;
  precio_neto_ars: number;
  accesorios_ars: number;
  unidad_medida: string | null;
  costo_total_ars: number;
  costo_unitario_ars: number | null;
  precio_unitario_ars: number | null;
  cargado_por: string;
  cargado_en: string;
}

export interface LoteSinCosto {
  id: string;
  numero_registro_interno: string;
  insumo_id: string;
  codigo_interno: string;
  insumo_nombre: string;
  cantidad_unidades: number | null;
  unidad: string;
  recepcion_id: string | null;
  recepcion_numero: string | null;
  recepcion_fecha: string | null;
  proveedor: string | null;
}

export interface Accesorio {
  id: string;
  recepcion_id: string;
  concepto: 'FLETE' | 'SEGURO' | 'ARANCELES' | 'DESPACHANTE' | 'OTRO';
  descripcion: string | null;
  tipo_comprobante: Comprobante;
  importe: number;
  moneda: Moneda;
  importe_neto_ars: number;
  rectifica_a: string | null;
  cargado_en: string;
}

export interface Conciliacion {
  recepcion_id: string;
  recepcion: string;
  fecha: string;
  proveedor_id: string;
  comprobantes: number;
  neto_comprobantes: number;
  lotes: number;
  lotes_con_costo: number;
  neto_lotes: number;
  diferencia: number;
  con_aviso: boolean;
}

export interface CostoProducto {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  origen: string | null;
  contenido_neto: number | null;
  unidad_contenido: 'g' | 'mL' | null;
  formula_estado: string | null;
  formula_version: string | null;
  granel: number | null;
  acondicionamiento: number | null;
  mano_de_obra: number | null;
  costo_unitario: number | null;
  faltantes: number;
  componentes_costeados: number;
  /** Costo de la planilla C.T. o fijado por Finanzas (D-56). */
  planilla_id: string | null;
  costo_planilla: number | null;
  planilla_cvd: number | null;
  planilla_mod: number | null;
  planilla_cvi: number | null;
  planilla_fuente: string | null;
  /** El calculado si está completo; si no, el de la planilla. */
  costo_vigente: number | null;
  fuente_costo: 'CALCULADO' | 'PLANILLA' | null;
}

export interface ComponenteCosto {
  orden: number;
  tipo: 'GRANEL' | 'ACONDICIONAMIENTO' | 'MANO_DE_OBRA';
  componente: string;
  insumo_id: string | null;
  codigo_interno: string | null;
  cantidad: number | null;
  unidad: string | null;
  merma: number | null;
  costo_unitario: number | null;
  origen_costo: string | null;
  subtotal: number | null;
  falta: string | null;
}

export interface ParametrosCosto {
  costo_hora: number | null;
  umbral_variacion: number;
  margen_minimo: number;
  vigencia_cotizacion_dias: number;
  serie_tipo_cambio: string;
  cargado_por: string | null;
  cargado_en: string | null;
  /** Cortes del Pareto (Fase 4). */
  corte_a: number;
  corte_b: number;
  /** D-42: antes de esta fecha (o sin fecha) el costo figura DESACTUALIZADO. */
  corte_apertura: string;
}

export type SerieMacro = 'IPC' | 'TC_A3500_PROMEDIO' | 'TC_A3500_CIERRE';

export interface PuntoSerieMacro {
  id: string;
  serie: SerieMacro;
  mes: string;
  valor: number;
  fuente: string;
  es_provisorio: boolean;
  cargado_en: string;
}

export interface AvisoCosto {
  id: string;
  costo_lote_id: string;
  insumo_id: string;
  costo_referencia_id: string;
  precio_lote_unitario: number;
  costo_referencia_unitario: number;
  variacion_nominal: number;
  ipc_acumulado: number | null;
  variacion_real: number;
  umbral: number;
  creado_en: string;
  visto_por: string | null;
  visto_en: string | null;
}

/** PostgREST devuelve numeric como texto o número según el tipo: se normaliza. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function numeros<T>(fila: Record<string, unknown>, campos: (keyof T)[]): T {
  const out: Record<string, unknown> = { ...fila };
  for (const c of campos) out[c as string] = num(fila[c as string]);
  return out as T;
}

async function leer<T>(
  consulta: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw error as Error; // PostgrestError: tiene message y code, como Error
  return (data ?? []) as T;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export function useCostosReferencia() {
  return useQuery({
    queryKey: ['costos', 'referencia'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_costo_referencia').select('*').order('codigo_interno'),
        )
      ).map((f) =>
        numeros<CostoReferencia>(f, [
          'costo_unitario_ars',
          'costo_manual',
          'costo_ultimo_lote',
          'costo_apertura',
          'tipo_cambio_aplicado',
        ]),
      ),
  });
}

export function useCostosPendientes() {
  return useQuery({
    queryKey: ['costos', 'pendientes'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_costos_pendientes').select('*').order('codigo_interno'),
        )
      ).map((f) => numeros<CostoPendiente>(f, ['importe', 'cantidad'])),
  });
}

/** Tipo de cambio con que se convierten los costos de apertura en dólares (D-42). */
export function useTipoCambioActivo() {
  return useQuery({
    queryKey: ['costos', 'tipo-cambio-activo'],
    queryFn: async () => {
      const [f] = await leer<Record<string, unknown>[]>(
        sinTipos().from('v_tipo_cambio_activo').select('*'),
      );
      return f
        ? numeros<{
            serie: SerieMacro;
            mes: string;
            valor: number;
            es_provisorio: boolean;
          }>(f, ['valor'])
        : null;
    },
  });
}

export function useCostosLote() {
  return useQuery({
    queryKey: ['costos', 'lotes'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('v_costos_lote_unitario')
            .select('*')
            .order('fecha_costo', { ascending: false, nullsFirst: false }),
        )
      ).map((f) =>
        numeros<CostoLote>(f, [
          'importe',
          'tipo_cambio',
          'cantidad',
          'precio_neto_ars',
          'accesorios_ars',
          'costo_total_ars',
          'costo_unitario_ars',
          'precio_unitario_ars',
        ]),
      ),
  });
}

/** Lotes recibidos (no de apertura) que todavía no tienen costo cargado. */
export function useLotesSinCosto() {
  return useQuery({
    queryKey: ['costos', 'lotes-sin-costo'],
    queryFn: async () => {
      const lotes = await leer<LoteSinCosto[]>(
        gmpSinTipos()
          .from('v_lotes_insumo')
          .select(
            'id, numero_registro_interno, insumo_id, codigo_interno, insumo_nombre, cantidad_unidades, unidad, recepcion_id, recepcion_numero, recepcion_fecha, proveedor',
          )
          .not('recepcion_id', 'is', null)
          .order('recepcion_fecha', { ascending: false }),
      );
      const conCosto = await leer<{ lote_insumo_id: string }[]>(
        sinTipos().from('costos_lote').select('lote_insumo_id'),
      );
      const tienen = new Set(conCosto.map((c) => c.lote_insumo_id));
      return lotes.filter((l) => !tienen.has(l.id));
    },
  });
}

export function useAccesorios(recepcionId: string | null) {
  return useQuery({
    queryKey: ['costos', 'accesorios', recepcionId],
    enabled: !!recepcionId,
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('costos_accesorios')
            .select('*')
            .eq('recepcion_id', recepcionId!)
            .order('cargado_en'),
        )
      ).map((f) => numeros<Accesorio>(f, ['importe', 'importe_neto_ars'])),
  });
}

export function useConciliacion() {
  return useQuery({
    queryKey: ['costos', 'conciliacion'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('v_conciliacion_recepcion')
            .select('*')
            .order('fecha', { ascending: false }),
        )
      ).map((f) =>
        numeros<Conciliacion>(f, [
          'comprobantes',
          'neto_comprobantes',
          'lotes',
          'lotes_con_costo',
          'neto_lotes',
          'diferencia',
        ]),
      ),
  });
}

export function useCostosProducto() {
  return useQuery({
    queryKey: ['costos', 'productos'],
    staleTime: 60_000, // ponytail: la vista calcula ~480 productos por lectura
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_costo_producto').select('*').order('nombre'),
        )
      ).map((f) =>
        numeros<CostoProducto>(f, [
          'contenido_neto',
          'granel',
          'acondicionamiento',
          'mano_de_obra',
          'costo_unitario',
          'faltantes',
          'componentes_costeados',
          'costo_planilla',
          'planilla_cvd',
          'planilla_mod',
          'planilla_cvi',
          'costo_vigente',
        ]),
      ),
  });
}

export function useDesgloseProducto(productoId: string | null) {
  return useQuery({
    queryKey: ['costos', 'desglose', productoId],
    enabled: !!productoId,
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().rpc('costo_producto', { p_producto_id: productoId }),
        )
      ).map((f) =>
        numeros<ComponenteCosto>(f, ['cantidad', 'merma', 'costo_unitario', 'subtotal']),
      ),
  });
}

export function useParametrosCosto() {
  return useQuery({
    queryKey: ['costos', 'parametros'],
    queryFn: async () => {
      const [f] = await leer<Record<string, unknown>[]>(
        sinTipos().from('v_parametros_costo').select('*'),
      );
      return numeros<ParametrosCosto>(f ?? {}, [
        'costo_hora',
        'umbral_variacion',
        'margen_minimo',
        'vigencia_cotizacion_dias',
        'corte_a',
        'corte_b',
      ]);
    },
  });
}

/** Último minuto cargado por producto. */
export function useMinutosProducto() {
  return useQuery({
    queryKey: ['costos', 'minutos'],
    queryFn: async () => {
      const filas = await leer<
        { producto_id: string; minutos_por_unidad: number; orden: number }[]
      >(
        sinTipos()
          .from('minutos_producto')
          .select('producto_id, minutos_por_unidad, orden')
          .order('orden', { ascending: false }),
      );
      const mapa = new Map<string, number>();
      for (const f of filas)
        if (!mapa.has(f.producto_id))
          mapa.set(f.producto_id, Number(f.minutos_por_unidad));
      return mapa;
    },
  });
}

export function useSeriesMacro() {
  return useQuery({
    queryKey: ['costos', 'series'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('series_macro').select('*').order('mes', { ascending: false }),
        )
      ).map((f) => numeros<PuntoSerieMacro>(f, ['valor'])),
  });
}

export function useAvisosCosto() {
  return useQuery({
    queryKey: ['costos', 'avisos'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('avisos_costo')
            .select('*')
            .order('creado_en', { ascending: false }),
        )
      ).map((f) =>
        numeros<AvisoCosto>(f, [
          'precio_lote_unitario',
          'costo_referencia_unitario',
          'variacion_nominal',
          'ipc_acumulado',
          'variacion_real',
          'umbral',
        ]),
      ),
  });
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export interface CostoLoteNuevo {
  lote_insumo_id: string;
  tipo_comprobante: Comprobante;
  importe: number;
  incluye_iva: boolean | null;
  alicuota_iva: number | null;
  moneda: Moneda;
  tipo_cambio: number;
  cantidad: number;
  unidad: string;
  fecha_costo: string | null;
  rectifica_a?: string | null;
  motivo?: string | null;
}

/** Normaliza IVA y moneda a lo que exigen los CHECK de la tabla. */
function filaCosto<T extends { tipo_comprobante: Comprobante; moneda: Moneda }>(
  c: T & {
    incluye_iva: boolean | null;
    alicuota_iva: number | null;
    tipo_cambio: number;
  },
) {
  const esA = c.tipo_comprobante === 'FACTURA_A';
  return {
    ...c,
    incluye_iva: esA ? !!c.incluye_iva : null,
    alicuota_iva: esA ? (c.alicuota_iva ?? 21) : null,
    tipo_cambio: c.moneda === 'ARS' ? 1 : c.tipo_cambio,
  };
}

const invalidarCostos = (qc: ReturnType<typeof useQueryClient>) =>
  void qc.invalidateQueries({ queryKey: ['costos'] });

export function useCargarCostosLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (costos: CostoLoteNuevo[]) => {
      if (costos.length === 0) return;
      const { error } = await sinTipos()
        .from('costos_lote')
        .insert(costos.map(filaCosto));
      if (error) throw error;
    },
    onSuccess: (_d, costos) => {
      invalidarCostos(qc);
      if (costos.some((c) => c.rectifica_a))
        avisarExito('Costo rectificado. El anterior queda en el historial.');
      else if (costos.length) avisarExito('Costo del lote cargado.');
    },
    onError: avisarError,
  });
}

export function useCargarAccesorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      recepcion_id: string;
      concepto: Accesorio['concepto'];
      descripcion: string | null;
      tipo_comprobante: Comprobante;
      importe: number;
      incluye_iva: boolean | null;
      alicuota_iva: number | null;
      moneda: Moneda;
      tipo_cambio: number;
      fecha_costo: string | null;
      rectifica_a?: string | null;
      motivo?: string | null;
    }) => {
      const { error } = await sinTipos().from('costos_accesorios').insert(filaCosto(a));
      if (error) throw error;
    },
    onSuccess: (_d, a) => {
      invalidarCostos(qc);
      avisarExito(
        a.rectifica_a
          ? 'Accesorio corregido.'
          : 'Accesorio cargado y prorrateado entre los lotes.',
      );
    },
    onError: avisarError,
  });
}

export function useFijarCostoReferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      insumo_id: string;
      importe: number;
      /** D-42: se puede tipear con IVA; la base guarda el neto aparte. */
      incluye_iva: boolean;
      alicuota_iva: number | null;
      cantidad: number;
      unidad: string;
      moneda: Moneda;
      tipo_cambio: number;
      vigente_desde: string;
      vigente_hasta: string | null;
      motivo: string | null;
    }) => {
      const { error } = await sinTipos()
        .from('costos_referencia')
        .insert({
          ...r,
          alicuota_iva: r.incluye_iva ? r.alicuota_iva : null,
          tipo_cambio: r.moneda === 'ARS' ? 1 : r.tipo_cambio,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Costo de referencia fijado. Lo pagado en cada lote no cambia.');
    },
    onError: avisarError,
  });
}

/**
 * Costo aproximado de Gerencia de Producción (D-costo-estimado-1): «$ 85.000
 * por 20 l». Solo rige si el insumo no tiene precio de Finanzas, compra ni
 * apertura; el último cargado reemplaza al anterior.
 */
export function useCargarCostoEstimado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: {
      insumo_id: string;
      importe: number;
      cantidad: number;
      unidad: string;
    }) => {
      const { error } = await sinTipos().from('costos_estimados').insert(e);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Costo aproximado guardado.');
    },
    onError: avisarError,
  });
}

export function useDarDeBajaReferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id: string; hasta: string }) => {
      const { error } = await sinTipos()
        .from('costos_referencia')
        .update({ vigente_hasta: r.hasta })
        .eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Precio manual dado de baja: rige el último lote.');
    },
    onError: avisarError,
  });
}

export function useCargarParametros() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      costo_hora: number | null;
      umbral_variacion: number;
      margen_minimo: number;
      vigencia_cotizacion_dias: number;
      corte_a?: number;
      corte_b?: number;
      corte_apertura?: string | null;
      motivo: string | null;
    }) => {
      const { error } = await sinTipos().from('parametros_costo').insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Parámetros guardados. Los anteriores quedan en el historial.');
    },
    onError: avisarError,
  });
}

/** Quién fija el costo de producto de planilla (D-56): Finanzas. */
export const ROLES_COSTO_PLANILLA: Rol[] = [FINANZAS];

/** Reemplaza el costo de planilla de un producto: fila nueva, la anterior queda. */
export function useCargarCostoPlanilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      producto_id: string;
      cvd: number | null;
      mod: number | null;
      cvi: number | null;
      reemplaza_a: string | null;
      motivo: string | null;
    }) => {
      const { error } = await sinTipos()
        .from('costos_producto_planilla')
        .insert({ ...c, fuente: 'Fijado por Finanzas' });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Costo del producto guardado. El anterior queda en el historial.');
    },
    onError: avisarError,
  });
}

export function useCargarMinutos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      producto_id: string;
      minutos_por_unidad: number;
      motivo: string | null;
    }) => {
      const { error } = await sinTipos().from('minutos_producto').insert(m);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Minutos por unidad guardados.');
    },
    onError: avisarError,
  });
}

/** Lo que Naza elige; en la base queda en g o mL (gmp.productos.unidad_contenido). */
export const UNIDADES_GRANEL = [
  { value: 'kg', base: 'g', factor: 1000 },
  { value: 'g', base: 'g', factor: 1 },
  { value: 'L', base: 'mL', factor: 1000 },
  { value: 'ml', base: 'mL', factor: 1 },
] as const;
export type UnidadGranel = (typeof UNIDADES_GRANEL)[number]['value'];

/** Cantidad en la unidad elegida → lo que guarda la base. */
export function aContenido(cantidad: number, unidad: UnidadGranel) {
  const u = UNIDADES_GRANEL.find((x) => x.value === unidad)!;
  return { contenido_neto: cantidad * u.factor, unidad_contenido: u.base };
}

/**
 * Cantidad teórica de una orden por frasco × unidades (pedido del
 * 2026-10-28): en kg si va en masa, en L si va en volumen, a 3 decimales
 * como gmp.ordenes_produccion.cantidad_teorica. Null si falta un dato.
 */
export function totalOrden(porUnidad: number, unidad: UnidadGranel, unidades: number) {
  if (!(porUnidad > 0) || !(unidades > 0)) return null;
  const c = aContenido(porUnidad, unidad);
  return {
    cantidad: Math.round(c.contenido_neto * unidades) / 1000,
    unidad: c.unidad_contenido === 'g' ? ('kg' as const) : ('L' as const),
  };
}

/** Contenido neto por unidad: dato de rótulo, en gmp.productos. */
export function useCargarContenidoNeto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      producto_id: string;
      contenido_neto: number | null;
      unidad_contenido: 'g' | 'mL' | null;
    }) => {
      const { data, error } = await gmpSinTipos()
        .from('productos')
        .update({
          contenido_neto: c.contenido_neto,
          unidad_contenido: c.unidad_contenido,
        })
        .eq('id', c.producto_id)
        .select('id');
      if (error) throw error;
      if (!data?.length)
        throw new Error('No tenés permiso para cambiar el contenido del producto.');
    },
    onSuccess: () => {
      invalidarCostos(qc);
      void qc.invalidateQueries({ queryKey: ['productos'] });
      avisarExito('Contenido neto guardado.');
    },
    onError: avisarError,
  });
}

export function useCargarSerie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: {
      id?: string;
      serie: SerieMacro;
      mes: string;
      valor: number;
      fuente: string;
      es_provisorio: boolean;
    }) => {
      const { error } = s.id
        ? await sinTipos()
            .from('series_macro')
            .update({ valor: s.valor, fuente: s.fuente, es_provisorio: s.es_provisorio })
            .eq('id', s.id)
        : await sinTipos().from('series_macro').insert({
            serie: s.serie,
            mes: s.mes,
            valor: s.valor,
            fuente: s.fuente,
            es_provisorio: s.es_provisorio,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Serie guardada.');
    },
    onError: avisarError,
  });
}

export interface ResultadoSeriesOficiales {
  insertados: number;
  actualizados: number;
  dolar: { mes: string; valor: number; es_provisorio: boolean } | null;
  ipc: { mes: string; valor: number } | null;
  /** Una fuente que no respondió: la otra se cargó igual. */
  errores: string[];
}

/**
 * Dólar A3500 (BCRA) e IPC (INDEC) desde las fuentes oficiales, por la Edge
 * Function `series-oficiales`, a nombre de quien la llama (sólo Finanzas
 * escribe). `silencioso`: la corrida automática al abrir Costos no avisa si no
 * hubo nada nuevo.
 */
export function useTraerSeriesOficiales() {
  const qc = useQueryClient();
  return useMutation<ResultadoSeriesOficiales, Error, { silencioso?: boolean }>({
    mutationFn: async () => {
      // `invoke` tipa el error como any: se lo toma como unknown.
      const r = await supabase.functions.invoke<ResultadoSeriesOficiales>(
        'series-oficiales',
        { method: 'POST' },
      );
      const data = r.data;
      const error: unknown = r.error;
      if (error) {
        const cuerpo = (await (error as { context?: Response }).context
          ?.json()
          .catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? 'No se pudo consultar al BCRA y al INDEC.');
      }
      if (!data) throw new Error('La función no devolvió resultado.');
      return data;
    },
    onSuccess: (r, { silencioso }) => {
      if (r.insertados + r.actualizados > 0) invalidarCostos(qc);
      for (const e of r.errores) avisarError(new Error(e));
      if (silencioso && r.insertados + r.actualizados === 0) return;
      const dolar = r.dolar
        ? ` Dólar A3500: $ ${r.dolar.valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}.`
        : '';
      avisarExito(
        r.insertados + r.actualizados > 0
          ? `Series al día: ${r.insertados} meses nuevos, ${r.actualizados} actualizados.${dolar}`
          : `Las series ya estaban al día.${dolar}`,
      );
    },
    onError: (e, { silencioso }) => {
      if (!silencioso) avisarError(e);
    },
  });
}

export function useMarcarAvisoVisto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; usuarioId: string }) => {
      const { error } = await sinTipos()
        .from('avisos_costo')
        .update({ visto_por: a.usuarioId, visto_en: new Date().toISOString() })
        .eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => invalidarCostos(qc),
    onError: avisarError,
  });
}

// ---------------------------------------------------------------------------
// Fase 2: panel por producto (20261009130000)
// ---------------------------------------------------------------------------

export interface FotoCosto {
  mes: string;
  producto_id: string;
  costo_unitario: number | null;
  granel: number | null;
  acondicionamiento: number | null;
  mano_de_obra: number | null;
  faltantes: number;
  formula_estado: string | null;
}

export type Banda = 'CONSUMIDOR_FINAL' | 'MAYORISTA' | 'MAYORISTA_PROMO';

export const ETIQUETA_BANDA: Record<Banda, string> = {
  CONSUMIDOR_FINAL: 'Consumidor final',
  MAYORISTA: 'Mayorista',
  MAYORISTA_PROMO: 'Mayorista con promoción',
};

export interface PrecioHistorico {
  mes: string;
  banda: Banda;
  precio_neto: number;
}

export interface StockInsumoValorizado {
  lote_insumo_id: string;
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  tipo: string;
  deposito_id: string;
  saldo: number;
  unidad: string;
  unidad_medida: string | null;
  saldo_unidad_catalogo: number | null;
  costo_unitario_ars: number | null;
  origen_costo: string | null;
  valor_ars: number | null;
}

export interface StockPtValorizado {
  deposito_id: string;
  deposito: string;
  producto_id: string;
  producto: string;
  saldo: number;
  retenido: number;
  costo_unitario: number | null;
  faltantes: number | null;
  valor_ars: number | null;
}

/**
 * Toma (o actualiza) la foto del mes en curso. La llama el panel al abrirse:
 * así la historia mensual se arma sola sin una tarea programada (D-47).
 */
export function useTomarFotoCostos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sinTipos().rpc('tomar_foto_costos');
      if (error) throw error as Error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['costos', 'fotos'] }),
  });
}

export function useFotosCosto(productoId: string | null) {
  return useQuery({
    queryKey: ['costos', 'fotos', productoId],
    enabled: !!productoId,
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('fotos_costo_producto')
            .select(
              'mes, producto_id, costo_unitario, granel, acondicionamiento, mano_de_obra, faltantes, formula_estado',
            )
            .eq('producto_id', productoId!)
            .order('mes'),
        )
      ).map((f) =>
        numeros<FotoCosto>(f, [
          'costo_unitario',
          'granel',
          'acondicionamiento',
          'mano_de_obra',
          'faltantes',
        ]),
      ),
  });
}

export function useHistoriaPrecios(productoId: string | null, meses = 12) {
  return useQuery({
    queryKey: ['costos', 'precios', productoId, meses],
    enabled: !!productoId,
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().rpc('historia_precios', {
            p_producto_id: productoId,
            p_meses: meses,
          }),
        )
      ).map((f) => numeros<PrecioHistorico>(f, ['precio_neto'])),
  });
}

export function useStockValorizadoInsumos() {
  return useQuery({
    queryKey: ['costos', 'stock-insumos'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('v_stock_valorizado_insumos')
            .select('*')
            .order('codigo_interno'),
        )
      ).map((f) =>
        numeros<StockInsumoValorizado>(f, [
          'saldo',
          'saldo_unidad_catalogo',
          'costo_unitario_ars',
          'valor_ars',
        ]),
      ),
  });
}

export function useStockValorizadoPt() {
  return useQuery({
    queryKey: ['costos', 'stock-pt'],
    staleTime: 60_000,
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_stock_valorizado_pt').select('*').order('producto'),
        )
      ).map((f) =>
        numeros<StockPtValorizado>(f, [
          'saldo',
          'retenido',
          'costo_unitario',
          'faltantes',
          'valor_ars',
        ]),
      ),
  });
}

/** Margen sobre el precio (el del punto de equilibrio): m = (P − C) / P. */
export const margenSobrePrecio = (precio: number, costo: number) =>
  precio > 0 ? (precio - costo) / precio : null;

/**
 * Sensibilidad: si un componente que pesa `subtotal` en un costo `total` sube
 * `variacion` (fracción), el costo total sube subtotal × variación / total.
 */
export const sensibilidad = (subtotal: number, total: number, variacion: number) =>
  total > 0 ? (subtotal * variacion) / total : 0;

// ---------------------------------------------------------------------------
// Fase 3: gastos y resultado de gestión (20261009140000)
// ---------------------------------------------------------------------------

export type ClaseGasto = 'FIJO' | 'OPERATIVO' | 'INVERSION';

export const ETIQUETA_CLASE: Record<ClaseGasto, string> = {
  FIJO: 'Costo fijo',
  OPERATIVO: 'Gasto operativo',
  INVERSION: 'Inversión',
};

export interface CategoriaGasto {
  id: string;
  nombre: string;
  clase: ClaseGasto;
  es_nomina_produccion: boolean;
  activa: boolean;
}

export interface Gasto {
  id: string;
  categoria_id: string;
  categoria: string;
  clase: ClaseGasto;
  es_nomina_produccion: boolean;
  mes: string;
  fecha: string;
  descripcion: string;
  tipo_comprobante: Comprobante;
  importe: number;
  moneda: Moneda;
  tipo_cambio: number;
  importe_neto_ars: number;
  vida_util_meses: number | null;
  comprobante_url: string | null;
  cargado_por: string;
  cargado_en: string;
}

export interface ResultadoMes {
  mes: string;
  facturacion: number;
  costo_variable: number;
  margen_contribucion: number;
  margen_contribucion_pct: number | null;
  costos_fijos: number;
  nomina_produccion: number;
  mano_de_obra_vendida: number;
  mano_de_obra_no_absorbida: number;
  gastos_operativos: number;
  amortizaciones: number;
  costos_estructura: number;
  /** Para el equilibrio: fijos + nómina + operativos + amortizaciones (D-48). */
  estructura_equilibrio: number;
  margen_sin_mano_de_obra: number;
  costos_totales: number;
  resultado: number;
  facturacion_equilibrio: number | null;
  gastos_sin_comprobante: number;
  productos_sin_costo: number;
  productos_costo_incompleto: number;
}

export const ROLES_CARGAN_GASTOS: Rol[] = [
  FINANZAS,
  'GERENCIA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
];

export function useCategoriasGasto() {
  return useQuery({
    queryKey: ['costos', 'categorias'],
    queryFn: async () =>
      leer<CategoriaGasto[]>(
        sinTipos().from('categorias_gasto').select('*').order('clase').order('nombre'),
      ),
  });
}

export function useGastos() {
  return useQuery({
    queryKey: ['costos', 'gastos'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('v_gastos')
            .select('*')
            .order('mes', { ascending: false })
            .order('cargado_en', { ascending: false }),
        )
      ).map((f) =>
        numeros<Gasto>(f, [
          'importe',
          'tipo_cambio',
          'importe_neto_ars',
          'vida_util_meses',
        ]),
      ),
  });
}

export function useCargarGasto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: {
      categoria_id: string;
      mes: string;
      descripcion: string;
      tipo_comprobante: Comprobante;
      importe: number;
      incluye_iva: boolean | null;
      alicuota_iva: number | null;
      moneda: Moneda;
      tipo_cambio: number;
      vida_util_meses: number | null;
      comprobante_url: string | null;
      rectifica_a?: string | null;
      motivo?: string | null;
    }) => {
      const { error } = await sinTipos().from('gastos').insert(filaCosto(g));
      if (error) throw error as Error;
    },
    onSuccess: (_d, g) => {
      invalidarCostos(qc);
      avisarExito(
        g.rectifica_a
          ? 'Gasto corregido. El anterior queda en el historial.'
          : 'Gasto cargado.',
      );
    },
    onError: avisarError,
  });
}

export function useResultadoGestion() {
  return useQuery({
    queryKey: ['costos', 'resultado'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_resultado_gestion').select('*').order('mes'),
        )
      ).map((f) =>
        numeros<ResultadoMes>(f, [
          'facturacion',
          'costo_variable',
          'margen_contribucion',
          'margen_contribucion_pct',
          'costos_fijos',
          'nomina_produccion',
          'mano_de_obra_vendida',
          'mano_de_obra_no_absorbida',
          'gastos_operativos',
          'amortizaciones',
          'costos_estructura',
          'estructura_equilibrio',
          'margen_sin_mano_de_obra',
          'costos_totales',
          'resultado',
          'facturacion_equilibrio',
          'gastos_sin_comprobante',
          'productos_sin_costo',
          'productos_costo_incompleto',
        ]),
      ),
  });
}

/**
 * Punto de equilibrio multiproducto: costos de estructura / margen de
 * contribución %. Misma cuenta que v_resultado_gestion; acá se usa para
 * recalcularlo en la moneda que se elige (dólares o pesos constantes).
 */
export function equilibrio(
  facturacion: number,
  margenContribucion: number,
  estructura: number,
): number | null {
  if (facturacion <= 0 || margenContribucion <= 0) return null;
  return estructura / (margenContribucion / facturacion);
}

// ---------------------------------------------------------------------------
// Fase 4: Pareto ABC y eficiencia (20261009150000)
// ---------------------------------------------------------------------------

export interface FilaPareto {
  producto_id: string;
  codigo_interno: string;
  producto: string;
  unidades: number;
  facturacion: number;
  participacion: number;
  acumulado: number;
  clase: 'A' | 'B' | 'C';
  costo_variable: number | null;
  margen: number | null;
  margen_pct: number | null;
  costo_incompleto: boolean;
}

export interface RotacionInsumo {
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  unidad_medida: string | null;
  saldo: number | null;
  valor_ars: number | null;
  lotes_sin_costo: number;
  consumo_90d: number;
  consumo_diario: number;
  dias_de_stock: number | null;
  rotacion_anual: number | null;
}

export interface PrecioProveedor {
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  unidad_medida: string | null;
  proveedor_id: string;
  proveedor: string;
  compras: number;
  ultima_compra: string | null;
  ultimo_precio: number | null;
  precio_promedio_hoy: number | null;
  precio_minimo_hoy: number | null;
}

export interface AlertaPrecio {
  producto_id: string;
  codigo_interno: string;
  producto: string;
  banda: Banda;
  precio_neto: number;
  costo_unitario: number;
  margen_pct: number;
  alerta: 'BAJO_COSTO' | 'BAJO_MARGEN_MINIMO';
  costo_incompleto: boolean;
}

export function usePareto(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['costos', 'pareto', desde, hasta],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().rpc('pareto', { p_desde: desde, p_hasta: hasta }),
        )
      ).map((f) =>
        numeros<FilaPareto>(f, [
          'unidades',
          'facturacion',
          'participacion',
          'acumulado',
          'costo_variable',
          'margen',
          'margen_pct',
        ]),
      ),
  });
}

export function useRotacionInsumos() {
  return useQuery({
    queryKey: ['costos', 'rotacion'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos()
            .from('v_rotacion_insumos')
            .select('*')
            .order('valor_ars', { ascending: false, nullsFirst: false }),
        )
      ).map((f) =>
        numeros<RotacionInsumo>(f, [
          'saldo',
          'valor_ars',
          'lotes_sin_costo',
          'consumo_90d',
          'consumo_diario',
          'dias_de_stock',
          'rotacion_anual',
        ]),
      ),
  });
}

export function usePreciosProveedor() {
  return useQuery({
    queryKey: ['costos', 'precios-proveedor'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_precios_proveedor').select('*').order('codigo_interno'),
        )
      ).map((f) =>
        numeros<PrecioProveedor>(f, [
          'compras',
          'ultimo_precio',
          'precio_promedio_hoy',
          'precio_minimo_hoy',
        ]),
      ),
  });
}

export function useAlertasPrecio() {
  return useQuery({
    queryKey: ['costos', 'alertas-precio'],
    queryFn: async () =>
      (
        await leer<Record<string, unknown>[]>(
          sinTipos().from('v_alertas_precio').select('*').order('margen_pct'),
        )
      ).map((f) =>
        numeros<AlertaPrecio>(f, ['precio_neto', 'costo_unitario', 'margen_pct']),
      ),
  });
}

// ---------------------------------------------------------------------------
// Fase 6: importación (20261009170000)
// ---------------------------------------------------------------------------

export const ROLES_IMPORTAN: Rol[] = [FINANZAS, 'ADMINISTRACION'];

export function useImportarCostosReferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      archivo: string;
      hash: string;
      filas: Record<string, unknown>[];
    }) => {
      const r = await sinTipos().rpc('importar_costos_referencia', {
        p_archivo: v.archivo,
        p_hash: v.hash,
        p_filas: v.filas,
      });
      if (r.error) throw r.error as Error;
      return r.data as number;
    },
    onSuccess: (n) => {
      invalidarCostos(qc);
      avisarExito(
        `${n} costos de referencia importados. Quedó registrado quién, cuándo y el hash del archivo.`,
      );
    },
    onError: avisarError,
  });
}
