/**
 * Tareas de producción, tiempos y productividad (20261023130100, D-tareas-1).
 *
 * Puente sin tipos hasta regenerar database.types.ts con la migración
 * aplicada: los tipos de acá son el espejo de las tablas y vistas.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito } from './consultas';

const gmpST = () => (supabase as unknown as SupabaseClient).schema('gmp');

export type TipoTarea = 'ETIQUETAR' | 'ENVASAR' | 'LOTEAR' | 'OTRA';
export type EstadoTarea = 'PENDIENTE' | 'EN_CURSO' | 'LISTA' | 'CANCELADA';
export type CierreTramo = 'PAUSA' | 'LISTO_HOY' | 'COMPLETA' | 'CANCELADO';

export const TEXTO_TIPO: Record<TipoTarea, string> = {
  ETIQUETAR: 'Etiquetar',
  ENVASAR: 'Envasar',
  LOTEAR: 'Lotear',
  OTRA: 'Otra',
};

export interface TareaProduccion {
  id: string;
  tipo: TipoTarea;
  descripcion: string;
  producto_id: string | null;
  orden_id: string | null;
  cantidad: number | null;
  prioridad: number;
  asignadas: string[];
  estado: EstadoTarea;
  creada_en: string;
  terminada_en: string | null;
}

export interface Tramo {
  id: string;
  tarea_id: string;
  terminado_en: string | null;
  cierre: CierreTramo | null;
  cantidad: number | null;
}

export interface Participante {
  id: string;
  tramo_id: string;
  usuario_id: string;
  hasta: string | null;
}

export interface Jornada {
  id: string;
  fecha: string;
  usuario_id: string;
  entrada: string;
  salida: string;
  trabaja: boolean;
  orden: number;
}

export interface Persona {
  id: string;
  nombre_completo: string;
  rol: string;
}

/** El personal activo, para armar el día y los grupos. */
export function usePersonal() {
  return useQuery({
    queryKey: ['personal'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .schema('core')
        .from('v_nomina')
        .select('id, nombre_completo, rol')
        .eq('activo', true)
        .order('nombre_completo');
      if (error) throw error;
      const filas: Persona[] = data ?? [];
      return filas;
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    'tareas-produccion',
    'tramos-abiertos',
    'jornadas',
    'productividad',
    'tiempo-medido',
  ])
    void qc.invalidateQueries({ queryKey: [k] });
}

/** Tareas pendientes y en curso (más las listas de hoy), por prioridad. */
export function useTareasProduccion() {
  return useQuery({
    queryKey: ['tareas-produccion'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const { data, error } = await gmpST()
        .from('tareas_produccion')
        .select('*')
        .or(`estado.in.(PENDIENTE,EN_CURSO),terminada_en.gte.${hoy.toISOString()}`)
        .order('prioridad')
        .order('creada_en');
      if (error) throw error;
      return ((data ?? []) as TareaProduccion[]).map((t) => ({
        ...t,
        cantidad: t.cantidad === null ? null : Number(t.cantidad),
        prioridad: Number(t.prioridad),
      }));
    },
  });
}

/** Tramos abiertos con su grupo actual. */
export function useTramosAbiertos() {
  return useQuery({
    queryKey: ['tramos-abiertos'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('tarea_tramos')
        .select(
          'id, tarea_id, terminado_en, cierre, cantidad, tramo_participantes(id, tramo_id, usuario_id, hasta)',
        )
        .is('terminado_en', null);
      if (error) throw error;
      const filas: (Tramo & { tramo_participantes: Participante[] })[] = data ?? [];
      return filas;
    },
  });
}

/** Lo ya hecho de cada tarea (suma de los tramos cerrados). */
export function useHechoPorTarea(ids: string[]) {
  return useQuery({
    queryKey: ['tareas-produccion', 'hecho', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('tarea_tramos')
        .select('tarea_id, cantidad')
        .in('tarea_id', ids)
        .in('cierre', ['PAUSA', 'LISTO_HOY', 'COMPLETA']);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const t of (data ?? []) as { tarea_id: string; cantidad: number | null }[])
        m.set(t.tarea_id, (m.get(t.tarea_id) ?? 0) + Number(t.cantidad ?? 0));
      return m;
    },
  });
}

export function useJornadas(fecha: string) {
  return useQuery({
    queryKey: ['jornadas', fecha],
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('jornadas_operarias')
        .select('*')
        .eq('fecha', fecha)
        .order('orden');
      if (error) throw error;
      return (data ?? []) as Jornada[];
    },
  });
}

/** Alta o cambio de la jornada de una operaria (quién trabaja y su horario). */
export function useGuardarJornada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (j: Partial<Jornada> & { fecha: string; usuario_id: string }) => {
      const { error } = await gmpST()
        .from('jornadas_operarias')
        .upsert(j, { onConflict: 'fecha,usuario_id' });
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useGuardarTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<TareaProduccion> & { id?: string }) => {
      const { id, ...cambios } = t;
      const { error } = id
        ? await gmpST().from('tareas_produccion').update(cambios).eq('id', id)
        : await gmpST().from('tareas_produccion').insert(cambios);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

/** Nuevo orden de prioridad: el índice en la lista pasa a ser la prioridad. */
export function useReordenarTareas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [i, id] of ids.entries()) {
        const { error } = await gmpST()
          .from('tareas_produccion')
          .update({ prioridad: i })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSettled: () => invalidar(qc),
    onError: avisarError,
  });
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const r = await gmpST().rpc(nombre, args);
  if (r.error) throw r.error;
}

export function useIniciarTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { tareaId: string; con: string[] }) =>
      rpc('iniciar_tarea', { p_tarea_id: p.tareaId, p_con: p.con }),
    onSuccess: () => {
      invalidar(qc);
      avisarExito('¡A trabajar!');
    },
    onError: avisarError,
  });
}

export function useCambiarGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { tramoId: string; usuarioId: string; entra: boolean }) =>
      rpc('cambiar_grupo', {
        p_tramo_id: p.tramoId,
        p_usuario_id: p.usuarioId,
        p_entra: p.entra,
      }),
    onSuccess: () => invalidar(qc),
    onError: avisarError,
  });
}

export function useCerrarTramo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { tramoId: string; cierre: CierreTramo; cantidad: number | null }) =>
      rpc('cerrar_tramo', {
        p_tramo_id: p.tramoId,
        p_cierre: p.cierre,
        p_cantidad: p.cantidad,
      }),
    onSuccess: (_d, p) => {
      invalidar(qc);
      avisarExito(
        p.cierre === 'COMPLETA'
          ? '¡Tarea terminada!'
          : p.cierre === 'CANCELADO'
            ? 'Cancelado: no se cuenta.'
            : 'Guardado. La tarea queda pendiente.',
      );
    },
    onError: avisarError,
  });
}

export interface FilaTrabajo {
  participacion_id: string;
  tramo_id: string;
  tarea_id: string;
  usuario_id: string;
  operaria: string | null;
  fecha: string;
  inicio: string;
  fin: string;
  minutos: number;
  tipo: TipoTarea;
  descripcion: string;
  producto_id: string | null;
  codigo_interno: string | null;
  producto: string | null;
  lote: string | null;
  cantidad: number;
  cierre: CierreTramo;
  con_quien: string | null;
  entrada: string | null;
  salida: string | null;
}

/** Trabajo por operaria entre dos fechas (inclusive): informe y productividad. */
export function useTrabajoOperarias(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['productividad', desde, hasta],
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('v_trabajo_operarias')
        .select('*')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('inicio');
      if (error) throw error;
      return ((data ?? []) as FilaTrabajo[]).map((f) => ({
        ...f,
        minutos: Number(f.minutos),
        cantidad: Number(f.cantidad),
      }));
    },
  });
}

export interface TiempoMedido {
  producto_id: string;
  tipo: TipoTarea;
  minutos_por_unidad: number | null;
  unidades: number;
  tramos: number;
}

/** Tiempo medido por unidad y persona de un producto, para envasar y etiquetar. */
export function useTiempoMedido(productoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['tiempo-medido', productoId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('v_tiempo_medido_producto')
        .select('*')
        .eq('producto_id', productoId);
      if (error) throw error;
      const m = new Map<TipoTarea, TiempoMedido>();
      for (const f of (data ?? []) as TiempoMedido[])
        m.set(f.tipo, {
          ...f,
          minutos_por_unidad:
            f.minutos_por_unidad === null ? null : Number(f.minutos_por_unidad),
        });
      return m;
    },
  });
}

export interface ProduccionSemanal {
  producto_id: string;
  viernes: string;
  cantidad: number;
}

/** Producido por semana (cierra el viernes) entre dos fechas. */
export function useProduccionSemanal(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['produccion-semanal', desde, hasta],
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('v_produccion_semanal')
        .select('*')
        .gte('viernes', desde)
        .lte('viernes', hasta);
      if (error) throw error;
      return ((data ?? []) as ProduccionSemanal[]).map((f) => ({
        ...f,
        cantidad: Number(f.cantidad),
      }));
    },
  });
}
