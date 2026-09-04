import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { core, gmp } from './supabase';
import type { Database } from './database.types';

/* ------------------------------------------------------------------------- *
 * Tipos de fila, derivados de los generados. Nada escrito a mano (CLAUDE.md §6).
 * ------------------------------------------------------------------------- */

export type Usuario = Database['core']['Tables']['usuarios']['Row'];
export type Deposito = Database['gmp']['Tables']['depositos']['Row'];
export type Proveedor = Database['gmp']['Tables']['proveedores']['Row'];
export type Insumo = Database['gmp']['Tables']['insumos_catalogo']['Row'];
export type Recepcion = Database['gmp']['Tables']['recepciones']['Row'];
export type LoteInsumo = Database['gmp']['Tables']['lotes_insumo']['Row'];
export type Rotulo = Database['gmp']['Tables']['rotulos']['Row'];
export type LoteVista = Database['gmp']['Views']['v_lotes_insumo']['Row'];
export type Tablero = Database['gmp']['Views']['v_tablero']['Row'];
export type Auditoria = Database['core']['Tables']['auditoria']['Row'];
export type EstadoCalidad = Database['gmp']['Enums']['estado_calidad_enum'];
export type TipoInsumo = Database['gmp']['Enums']['tipo_insumo_enum'];

/**
 * Traduce el error de Postgres a algo que se pueda leer en planta.
 *
 * Los mensajes de las reglas de negocio ya vienen redactados desde los triggers
 * («RN-01: falta el protocolo…»), así que se muestran tal cual. Lo que se
 * traduce es el ruido de infraestructura: violación de RLS, unicidad, FK.
 */
export function mensajeError(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: string };
  const texto = e?.message ?? String(error);

  if (e?.code === '42501' || /row-level security/i.test(texto)) {
    return 'Tu rol no tiene permiso para esta operación. Si creés que corresponde, pedile al administrador que revise tu rol.';
  }
  if (e?.code === '23505') {
    return 'Ya existe un registro con ese identificador.';
  }
  if (e?.code === '23503') {
    return 'Falta un dato relacionado o el registro referenciado no existe.';
  }
  return texto;
}

function avisarError(error: unknown) {
  notifications.show({
    color: 'red',
    title: 'No se pudo guardar',
    message: mensajeError(error),
    autoClose: 8000,
  });
}

function avisarExito(mensaje: string) {
  notifications.show({ color: 'violeta', title: 'Listo', message: mensaje });
}

/* ------------------------------------------------------------------------- *
 * Tablero
 * ------------------------------------------------------------------------- */

export function useTablero() {
  return useQuery({
    queryKey: ['tablero'],
    queryFn: async () => {
      const { data, error } = await gmp().from('v_tablero').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecepcionesPorDia() {
  return useQuery({
    queryKey: ['recepciones-por-dia'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_recepciones_por_dia')
        .select('*')
        .order('dia');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLotesPorEstado() {
  return useQuery({
    queryKey: ['lotes-por-estado'],
    queryFn: async () => {
      const { data, error } = await gmp().from('v_lotes_por_estado').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------------- *
 * Lotes de insumo
 * ------------------------------------------------------------------------- */

export function useLotes(filtro?: { estado?: EstadoCalidad | null; texto?: string }) {
  return useQuery({
    queryKey: ['lotes', filtro?.estado ?? null, filtro?.texto ?? ''],
    queryFn: async () => {
      let consulta = gmp()
        .from('v_lotes_insumo')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(300);

      if (filtro?.estado) consulta = consulta.eq('estado', filtro.estado);

      const texto = filtro?.texto?.trim();
      if (texto) {
        /* Búsqueda por lo que el operario tiene a mano: el número interno, el
           lote del proveedor o el nombre del insumo. */
        consulta = consulta.or(
          `numero_registro_interno.ilike.%${texto}%,lote_proveedor.ilike.%${texto}%,insumo_nombre.ilike.%${texto}%`,
        );
      }

      const { data, error } = await consulta;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLote(id: string | undefined) {
  return useQuery({
    queryKey: ['lote', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_lotes_insumo')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRotulosDeLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['rotulos', loteId],
    enabled: Boolean(loteId),
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('rotulos')
        .select('*')
        .eq('entidad_tipo', 'lote_insumo')
        .eq('entidad_id', loteId!)
        .order('emitido_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Avance de estado con emisión de rótulo.
 *
 * Una sola llamada, porque en la base es una sola transacción: I.20.2 exige
 * rotular de nuevo ante el cambio de estado, y separarlo en dos pasos dejaría
 * material en planta con un cartel que miente.
 */
export function useEmitirRotulo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ loteId, estado }: { loteId: string; estado: EstadoCalidad }) => {
      const { data, error } = await gmp().rpc('emitir_rotulo_lote_insumo', {
        p_lote_id: loteId,
        p_estado: estado,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lotes'] });
      void qc.invalidateQueries({ queryKey: ['lote'] });
      void qc.invalidateQueries({ queryKey: ['rotulos'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      void qc.invalidateQueries({ queryKey: ['lotes-por-estado'] });
      avisarExito('Rótulo emitido y estado actualizado.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Recepciones
 * ------------------------------------------------------------------------- */

export function useRecepciones() {
  return useQuery({
    queryKey: ['recepciones'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('recepciones')
        .select('*, proveedor:proveedores(razon_social), lotes:lotes_insumo(id)')
        .order('fecha_hora', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface LoteNuevo {
  insumo_id: string;
  lote_proveedor: string;
  cantidad_bultos: number;
  cantidad_unidades: number | null;
  unidad: string;
  plazo_validez: string | null;
  bultos_peso_similar: boolean | null;
  unidades_contadas: number | null;
  planchas_etiquetas: number | null;
  etiquetas_por_plancha: number | null;
  protocolo_recibido: boolean | null;
  peso_pigmento_kg: number | null;
  contenedores_limpiados: boolean;
}

export interface RecepcionNueva {
  proveedor_id: string;
  proveedor_nuevo: boolean;
  numero_remito: string;
  coincide_con_pedido: boolean;
  observaciones: string | null;
  lotes: LoteNuevo[];
  /** Emitir el rótulo amarillo de cuarentena al terminar (I.20.1 → I.20.2). */
  rotularEnCuarentena: boolean;
}

/**
 * Alta de recepción con sus lotes.
 *
 * PostgREST no da transacciones entre llamadas, así que si un lote falla la
 * recepción ya quedó escrita. Se acepta a conciencia: una recepción sin lotes
 * es un registro incompleto, visible y corregible agregando el lote que falta;
 * lo que no se puede es borrarla, y eso es exactamente lo que la invariante 1
 * pide. Cuando el circuito crezca, esto pasa a una función de base con toda la
 * operación adentro.
 */
export function useCrearRecepcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: RecepcionNueva) => {
      const { data: recepcion, error } = await gmp()
        .from('recepciones')
        .insert({
          proveedor_id: entrada.proveedor_id,
          proveedor_nuevo: entrada.proveedor_nuevo,
          numero_remito: entrada.numero_remito,
          coincide_con_pedido: entrada.coincide_con_pedido,
          observaciones: entrada.observaciones,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: lotes, error: errorLotes } = await gmp()
        .from('lotes_insumo')
        .insert(
          entrada.lotes.map((l) => ({
            recepcion_id: recepcion.id,
            insumo_id: l.insumo_id,
            lote_proveedor: l.lote_proveedor,
            cantidad_bultos: l.cantidad_bultos,
            cantidad_unidades: l.cantidad_unidades,
            unidad: l.unidad,
            plazo_validez: l.plazo_validez,
            bultos_peso_similar: l.bultos_peso_similar,
            unidades_contadas: l.unidades_contadas,
            planchas_etiquetas: l.planchas_etiquetas,
            etiquetas_por_plancha: l.etiquetas_por_plancha,
            protocolo_recibido: l.protocolo_recibido,
            peso_pigmento_kg: l.peso_pigmento_kg,
            contenedores_limpiados: l.contenedores_limpiados,
          })),
        )
        .select();
      if (errorLotes) throw errorLotes;

      if (entrada.rotularEnCuarentena) {
        for (const lote of lotes ?? []) {
          const { error: errorRotulo } = await gmp().rpc('emitir_rotulo_lote_insumo', {
            p_lote_id: lote.id,
            p_estado: 'CUARENTENA',
          });
          if (errorRotulo) throw errorRotulo;
        }
      }

      return { recepcion, lotes: lotes ?? [] };
    },
    onSuccess: ({ recepcion }) => {
      void qc.invalidateQueries();
      avisarExito(`Recepción ${recepcion.numero} registrada.`);
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Maestros
 * ------------------------------------------------------------------------- */

export function useInsumos() {
  return useQuery({
    queryKey: ['insumos'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('insumos_catalogo')
        .select('*')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCrearInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      insumo: Database['gmp']['Tables']['insumos_catalogo']['Insert'],
    ) => {
      const { data, error } = await gmp()
        .from('insumos_catalogo')
        .insert(insumo)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      avisarExito('Insumo agregado al catálogo.');
    },
    onError: avisarError,
  });
}

export function useProveedores() {
  return useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('proveedores')
        .select('*')
        .order('razon_social');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCrearProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proveedor: Database['gmp']['Tables']['proveedores']['Insert']) => {
      const { data, error } = await gmp()
        .from('proveedores')
        .insert(proveedor)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proveedores'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      avisarExito('Proveedor dado de alta, pendiente de aprobación.');
    },
    onError: avisarError,
  });
}

/** Aprobación o rechazo de proveedor. El autor y el momento los pone la base. */
export function useDictaminarProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      estado,
      observaciones,
    }: {
      id: string;
      estado: Database['gmp']['Enums']['aprobacion_proveedor_enum'];
      observaciones?: string | null;
    }) => {
      const { data, error } = await gmp()
        .from('proveedores')
        .update({ estado_aprobacion: estado, observaciones: observaciones ?? null })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['proveedores'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      avisarExito(
        p.estado_aprobacion === 'APROBADO'
          ? 'Proveedor aprobado.'
          : 'Proveedor rechazado.',
      );
    },
    onError: avisarError,
  });
}

export function useDepositos() {
  return useQuery({
    queryKey: ['depositos'],
    queryFn: async () => {
      const { data, error } = await gmp().from('depositos').select('*').order('numero');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------------- *
 * Usuarios y auditoría
 * ------------------------------------------------------------------------- */

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await core()
        .from('usuarios')
        .select('*')
        .order('nombre_completo');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: Database['core']['Tables']['usuarios']['Update'];
    }) => {
      const { data, error } = await core()
        .from('usuarios')
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      avisarExito(
        'Ficha de usuario actualizada. El cambio de rol se aplica al renovar la sesión.',
      );
    },
    onError: avisarError,
  });
}

export function useAuditoria(limite = 200) {
  return useQuery({
    queryKey: ['auditoria', limite],
    queryFn: async () => {
      const { data, error } = await core()
        .from('auditoria')
        .select('*, usuario:usuarios(nombre_completo, rol)')
        .order('ocurrido_en', { ascending: false })
        .limit(limite);
      if (error) throw error;
      return data ?? [];
    },
  });
}
