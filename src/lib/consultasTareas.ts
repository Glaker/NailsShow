/**
 * Tareas de planta (20261014180000/180100). Asignar es opcional: sin
 * asignación, todo el personal de planta ve todo. Inicio, fin y «visto» los
 * pone la base con la hora del servidor.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { core, gmp } from './supabase';
import { useSesion, type Rol } from '@/features/auth/sesion';
import type { EtapaOrden } from './consultasOrdenes';

export type TareaPlanta = Database['gmp']['Tables']['tareas_planta']['Row'];

/** Asignan, crean tareas libres y reciben los avisos. */
export const ROLES_GESTIONAN_TAREAS: Rol[] = [
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
  'GERENCIA',
];

export function useTareasPlanta() {
  return useQuery({
    queryKey: ['tareas'],
    refetchInterval: 60_000, // ponytail: sondeo cada minuto; tiempo real si hace falta
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('tareas_planta')
        .select('*')
        .eq('anulada', false)
        .order('creada_en');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Quién puede recibir una tarea: operarios y Gerencia de Producción activos. */
export function usePersonalPlanta() {
  return useQuery({
    queryKey: ['personal-planta'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await core()
        .from('v_nomina')
        .select('id, nombre_completo, rol')
        .eq('activo', true)
        .in('rol', ['OPERARIO', 'GERENCIA_PRODUCCION']);
      if (error) throw error;
      return (data ?? []).filter((u) => u.id) as {
        id: string;
        nombre_completo: string | null;
        rol: Rol;
      }[];
    },
  });
}

/** Tareas terminadas por otro que Producción todavía no vio: el puntito. */
export function useAvisosTareas() {
  const { claims } = useSesion();
  const tareas = useTareasPlanta();
  const gestor = (claims?.roles ?? []).some((r) => ROLES_GESTIONAN_TAREAS.includes(r));
  if (!gestor) return [];
  return (tareas.data ?? []).filter(
    (t) => t.terminada_en && !t.visto_en && t.terminada_por !== claims?.usuario_id,
  );
}

// PostgrestError trae message: avisarError lo muestra igual que un Error.
function useMutacion<T>(fn: (v: T) => PromiseLike<{ error: Error | null }>, exito?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      const { error } = await fn(v);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tareas'] });
      void qc.invalidateQueries({ queryKey: ['ordenes'] });
      if (exito) avisarExito(exito);
    },
    onError: avisarError,
  });
}

/** Empieza la etapa (la base guarda quién y a qué hora) y devuelve la tarea. */
export function useEmpezarEtapa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ordenId: string; etapa: EtapaOrden }) => {
      const { data, error } = await gmp().rpc('empezar_etapa', {
        p_orden_id: v.ordenId,
        p_etapa: v.etapa,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tareas'] }),
    onError: avisarError,
  });
}

export const useAsignarEtapa = () =>
  useMutacion((v: { ordenId: string; etapa: EtapaOrden; usuario: string | null }) =>
    gmp().rpc('asignar_etapa', {
      p_orden_id: v.ordenId,
      p_etapa: v.etapa,
      // null = para todos; los tipos generados no admiten null en argumentos.
      p_usuario: v.usuario as string,
    }),
  );

export const useCrearTarea = () =>
  useMutacion(
    (v: { descripcion: string; asignada_a: string | null; orden_id: string | null }) =>
      gmp().from('tareas_planta').insert(v),
    'Tarea creada.',
  );

export const useAsignarTarea = () =>
  useMutacion((v: { id: string; usuario: string | null }) =>
    gmp().from('tareas_planta').update({ asignada_a: v.usuario }).eq('id', v.id),
  );

export const useQuitarTarea = () =>
  useMutacion(
    (id: string) => gmp().from('tareas_planta').update({ anulada: true }).eq('id', id),
    'Tarea quitada.',
  );

export const useEmpezarTarea = () =>
  useMutacion((id: string) => gmp().rpc('empezar_tarea', { p_id: id }));

export const useTerminarTarea = () =>
  useMutacion(
    (id: string) => gmp().rpc('terminar_tarea', { p_id: id }),
    'Listo. Le avisamos a Producción.',
  );

export const useMarcarVista = () =>
  useMutacion((id: string) => gmp().rpc('marcar_tarea_vista', { p_id: id }));
