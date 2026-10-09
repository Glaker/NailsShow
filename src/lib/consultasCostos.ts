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
  | 'FACTURA_A'
  | 'FACTURA_B'
  | 'FACTURA_C'
  | 'NO_DISCRIMINADO'
  | 'SIN_COMPROBANTE';

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
    comprobante === 'FACTURA_A' && incluyeIva ? importe / (1 + (alicuota ?? 0) / 100) : importe;
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

export type OrigenReferencia = 'MANUAL' | 'ULTIMO_LOTE' | 'APERTURA';

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

async function leer<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
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
        ]),
      ),
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
      ]);
    },
  });
}

/** Último minuto cargado por producto. */
export function useMinutosProducto() {
  return useQuery({
    queryKey: ['costos', 'minutos'],
    queryFn: async () => {
      const filas = await leer<{ producto_id: string; minutos_por_unidad: number; orden: number }[]>(
        sinTipos()
          .from('minutos_producto')
          .select('producto_id, minutos_por_unidad, orden')
          .order('orden', { ascending: false }),
      );
      const mapa = new Map<string, number>();
      for (const f of filas)
        if (!mapa.has(f.producto_id)) mapa.set(f.producto_id, Number(f.minutos_por_unidad));
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
          sinTipos().from('avisos_costo').select('*').order('creado_en', { ascending: false }),
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
  c: T & { incluye_iva: boolean | null; alicuota_iva: number | null; tipo_cambio: number },
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
      const { error } = await sinTipos().from('costos_lote').insert(costos.map(filaCosto));
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
        a.rectifica_a ? 'Accesorio corregido.' : 'Accesorio cargado y prorrateado entre los lotes.',
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
        .insert({ ...r, tipo_cambio: r.moneda === 'ARS' ? 1 : r.tipo_cambio });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCostos(qc);
      avisarExito('Costo de referencia fijado. Lo pagado en cada lote no cambia.');
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

export function useCargarMinutos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { producto_id: string; minutos_por_unidad: number; motivo: string | null }) => {
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
        .update({ contenido_neto: c.contenido_neto, unidad_contenido: c.unidad_contenido })
        .eq('id', c.producto_id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No tenés permiso para cambiar el contenido del producto.');
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
