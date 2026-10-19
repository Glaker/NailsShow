/**
 * Cotizador (20261009160000). Mismo puente de tipos que consultasCostos.ts:
 * las tablas se leen sin tipos generados hasta correr `npm run db:types`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FINANZAS, type Rol } from '@/features/auth/sesion';
import { avisarError, avisarExito } from './consultas';
import { supabase } from './supabase';
import type { ModoMargen, TipoLinea } from './cotizador';

const c = () => (supabase as unknown as SupabaseClient).schema('comercial');

export const ROLES_COTIZAN: Rol[] = [FINANZAS, 'GERENCIA', 'GERENCIA_PRODUCCION'];

export type EstadoCotizacion = 'BORRADOR' | 'EMITIDA' | 'ANULADA';
export type DestinoCotizacion = 'CLIENTE' | 'POTENCIAL' | 'INTERNO';

export interface Cotizacion {
  id: string;
  numero: number | null;
  anio: number | null;
  estado: EstadoCotizacion;
  titulo: string;
  producto_base_id: string | null;
  contenido_cantidad: number | null;
  contenido_unidad: 'g' | 'mL' | 'unidades' | null;
  cantidad_cotizada: number;
  destino: DestinoCotizacion;
  cliente_id: string | null;
  cliente_potencial_id: string | null;
  incluir_mano_obra: boolean;
  minutos_por_unidad: number | null;
  modo_margen: ModoMargen;
  fija: 'MARGEN' | 'PRECIO';
  margen_objetivo: number | null;
  precio_objetivo: number | null;
  redondeo: number;
  leyenda_iva: 'MAS_IVA' | 'IVA_INCLUIDO';
  alicuota_iva: number;
  vigencia_dias: number;
  observaciones: string | null;
  justificacion_margen: string | null;
  costo_unitario: number | null;
  precio_unitario: number | null;
  emitida_en: string | null;
  emitida_por: string | null;
  vence_el: string | null;
  foto: FotoCotizacion | null;
  motivo_anulacion: string | null;
  duplicada_de: string | null;
  creado_por: string;
  creado_en: string;
}

/** Lo que va al PDF: nada de costos (lo arma la base al emitir). */
export interface DatosPdf {
  numero: number;
  anio: number;
  fecha: string;
  vence_el: string;
  destino: DestinoCotizacion;
  cliente: {
    razon_social: string;
    documento?: string | null;
    contacto?: string | null;
  } | null;
  titulo: string;
  contenido_cantidad: number | null;
  contenido_unidad: string | null;
  cantidad: number;
  precio_unitario: number;
  total: number;
  leyenda_iva: 'MAS_IVA' | 'IVA_INCLUIDO';
  alicuota_iva: number;
  observaciones: string | null;
  emitida_por: string | null;
}

export interface FotoCotizacion {
  costo_unitario: number;
  precio_unitario: number;
  margen_sobre_precio: number;
  recargo_sobre_costo: number | null;
  mano_de_obra: number;
  pdf: DatosPdf;
}

export interface LineaGuardada {
  id: string;
  cotizacion_id: string;
  orden: number;
  tipo: TipoLinea;
  insumo_id: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number | null;
  cantidad_presentacion: number | null;
  unidad_presentacion: string | null;
  incluye_iva: boolean | null;
  alicuota_iva: number | null;
  densidad: number | null;
  merma: number;
}

export interface ClientePotencial {
  id: string;
  razon_social: string;
  cuit: string | null;
  contacto: string | null;
  cliente_id: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const aCotizacion = (f: Record<string, unknown>): Cotizacion => ({
  ...(f as unknown as Cotizacion),
  contenido_cantidad: num(f.contenido_cantidad),
  cantidad_cotizada: Number(f.cantidad_cotizada),
  minutos_por_unidad: num(f.minutos_por_unidad),
  margen_objetivo: num(f.margen_objetivo),
  precio_objetivo: num(f.precio_objetivo),
  redondeo: Number(f.redondeo),
  alicuota_iva: Number(f.alicuota_iva),
  costo_unitario: num(f.costo_unitario),
  precio_unitario: num(f.precio_unitario),
});
const aLinea = (f: Record<string, unknown>): LineaGuardada => ({
  ...(f as unknown as LineaGuardada),
  cantidad: Number(f.cantidad),
  precio: num(f.precio),
  cantidad_presentacion: num(f.cantidad_presentacion),
  alicuota_iva: num(f.alicuota_iva),
  densidad: num(f.densidad),
  merma: Number(f.merma),
});

async function filas<T>(
  p: PromiseLike<{ data: unknown; error: unknown }>,
  map: (f: Record<string, unknown>) => T,
) {
  const { data, error } = await p;
  if (error) throw error as Error;
  return ((data ?? []) as Record<string, unknown>[]).map(map);
}

const invalidar = (qc: ReturnType<typeof useQueryClient>) =>
  void qc.invalidateQueries({ queryKey: ['cotizaciones'] });

export function useCotizaciones() {
  return useQuery({
    queryKey: ['cotizaciones', 'lista'],
    queryFn: () =>
      filas(
        c().from('cotizaciones').select('*').order('creado_en', { ascending: false }),
        aCotizacion,
      ),
  });
}

export function useCotizacion(id: string | null) {
  return useQuery({
    queryKey: ['cotizaciones', 'una', id],
    enabled: !!id,
    queryFn: async () =>
      (await filas(c().from('cotizaciones').select('*').eq('id', id!), aCotizacion))[0] ??
      null,
  });
}

export function useLineasCotizacion(id: string | null) {
  return useQuery({
    queryKey: ['cotizaciones', 'lineas', id],
    enabled: !!id,
    queryFn: () =>
      filas(
        c()
          .from('cotizacion_lineas')
          .select('*')
          .eq('cotizacion_id', id!)
          .eq('anulada', false)
          .order('orden'),
        aLinea,
      ),
  });
}

export function useClientesPotenciales() {
  return useQuery({
    queryKey: ['cotizaciones', 'potenciales'],
    queryFn: () =>
      filas(
        c().from('clientes_potenciales').select('*').order('razon_social'),
        (f) => f as unknown as ClientePotencial,
      ),
  });
}

export function useCrearCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      titulo: string;
      vigencia_dias: number;
      producto_base_id: string | null;
    }) => {
      const { data, error } = await c()
        .from('cotizaciones')
        .insert({
          titulo: v.titulo,
          vigencia_dias: v.vigencia_dias,
          fija: 'MARGEN',
          margen_objetivo: 0.3,
        })
        .select('id')
        .single();
      if (error) throw error as Error;
      const id = data.id as string;
      if (v.producto_base_id) {
        const r = await c().rpc('lineas_desde_producto', {
          p_cotizacion_id: id,
          p_producto_id: v.producto_base_id,
        });
        if (r.error) throw r.error as Error;
      }
      return id;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

/** Guarda la cabecera del borrador (sólo las columnas editables). */
export function useGuardarCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; cambios: Partial<Cotizacion> }) => {
      const { error } = await c().from('cotizaciones').update(v.cambios).eq('id', v.id);
      if (error) throw error as Error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useGuardarLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: Partial<LineaGuardada> & { cotizacion_id: string }) => {
      const { id, cotizacion_id, ...resto } = l;
      const r = id
        ? await c().from('cotizacion_lineas').update(resto).eq('id', id)
        : await c()
            .from('cotizacion_lineas')
            .insert({ cotizacion_id, ...resto });
      if (r.error) throw r.error as Error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useQuitarLinea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await c()
        .from('cotizacion_lineas')
        .update({ anulada: true })
        .eq('id', id);
      if (error) throw error as Error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useEmitirCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; justificacion: string | null }) => {
      const r = await c().rpc('emitir_cotizacion', {
        p_id: v.id,
        p_justificacion: v.justificacion,
      });
      if (r.error) throw r.error as Error;
      return r.data as number;
    },
    onSuccess: (n) => {
      invalidar(qc);
      avisarExito(
        `Cotización n.º ${n} emitida. Ya no se edita: para cambiarla, duplicala.`,
      );
    },
    onError: avisarError,
  });
}

export function useAnularCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { error } = await c().rpc('anular_cotizacion', {
        p_id: v.id,
        p_motivo: v.motivo,
      });
      if (error) throw error as Error;
    },
    onSuccess: () => {
      invalidar(qc);
      avisarExito('Cotización anulada. Queda en el historial.');
    },
    onError: avisarError,
  });
}

export function useDuplicarCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await c().rpc('duplicar_cotizacion', { p_id: id });
      if (r.error) throw r.error as Error;
      return r.data as string;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useCrearPotencial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      razon_social: string;
      cuit: string | null;
      contacto: string | null;
    }) => {
      const { data, error } = await c()
        .from('clientes_potenciales')
        .insert(p)
        .select('id')
        .single();
      if (error) throw error as Error;
      return data.id as string;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useProponerCatalogo() {
  return useMutation({
    mutationFn: async (p: {
      cotizacion_linea_id: string;
      nombre: string;
      detalle: string | null;
    }) => {
      const { error } = await c().from('solicitudes_catalogo').insert(p);
      if (error) throw error as Error;
    },
    onSuccess: () =>
      avisarExito(
        'Propuesta enviada a Dirección Técnica. El catálogo no cambia hasta que la DT lo cargue.',
      ),
    onError: avisarError,
  });
}

/** Producción terminada en el período (para la vista de gerencia). */
export interface OrdenTerminada {
  id: string;
  numero: string;
  producto_id: string;
  terminada_en: string;
  unidades_obtenidas: number | null;
  cantidad_obtenida: number | null;
  unidad: string;
  terminada_por: string | null;
}

export function useProduccionPeriodo(desde: string) {
  return useQuery({
    queryKey: ['gerencia', 'produccion', desde],
    queryFn: () =>
      filas(
        (supabase as unknown as SupabaseClient)
          .schema('gmp')
          .from('ordenes_produccion')
          .select(
            'id, numero, producto_id, terminada_en, unidades_obtenidas, cantidad_obtenida, unidad, terminada_por',
          )
          .gte('terminada_en', desde)
          .order('terminada_en', { ascending: false }),
        (f) => ({
          ...(f as unknown as OrdenTerminada),
          unidades_obtenidas: num(f.unidades_obtenidas),
          cantidad_obtenida: num(f.cantidad_obtenida),
        }),
      ),
  });
}
