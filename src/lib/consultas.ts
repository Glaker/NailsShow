import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { comercial, core, gmp } from './supabase';
import type { Database } from './database.types';

/* ------------------------------------------------------------------------- *
 * Tipos de fila, derivados de los generados. Nada escrito a mano (CLAUDE.md §6).
 * ------------------------------------------------------------------------- */

export type Usuario = Database['core']['Tables']['usuarios']['Row'];
export type Deposito = Database['gmp']['Tables']['depositos']['Row'];
export type Proveedor = Database['gmp']['Tables']['proveedores']['Row'];
export type Insumo = Database['gmp']['Tables']['insumos_catalogo']['Row'];
export type Producto = Database['gmp']['Tables']['productos']['Row'];
export type OrigenProducto = Database['gmp']['Enums']['origen_producto_enum'];
export type Recepcion = Database['gmp']['Tables']['recepciones']['Row'];
export type LoteInsumo = Database['gmp']['Tables']['lotes_insumo']['Row'];
export type Rotulo = Database['gmp']['Tables']['rotulos']['Row'];
export type LoteVista = Database['gmp']['Views']['v_lotes_insumo']['Row'];
export type MuestreoVista = Database['gmp']['Views']['v_muestreos']['Row'];
export type DestinoMuestra = Database['gmp']['Enums']['destino_muestra_enum'];
export type CategoriaMuestreo = Database['gmp']['Enums']['categoria_muestreo_enum'];
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

export function avisarError(error: unknown) {
  notifications.show({
    color: 'red',
    title: 'No se pudo guardar',
    message: mensajeError(error),
    autoClose: 8000,
  });
}

export function avisarExito(mensaje: string) {
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

      /* PostgREST separa los términos de `or()` con comas y paréntesis, así
         que un texto que los contenga rompe la consulta. Se quitan: nadie
         busca un lote por una coma. */
      const texto = filtro?.texto?.replace(/[(),*"']/g, ' ').trim();
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
 * Muestreo (I.50.4)
 * ------------------------------------------------------------------------- */

export function useMuestreosDeLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['muestreos', loteId],
    enabled: Boolean(loteId),
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_muestreos')
        .select('*')
        .eq('entidad_tipo', 'lote_insumo')
        .eq('entidad_id', loteId!)
        .order('fecha_hora', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MuestreoNuevo {
  loteId: string;
  cantidadTomada: number;
  unidad: string;
  areaMuestreo: string;
  contenedorIntegro: boolean;
  contenedorLimpio: boolean;
  rotuladoCorrecto: boolean;
  cantidadContenedores: number;
  destinoSobrante: DestinoMuestra;
  loteCoincideCertificado: boolean | null;
  justificacionCantidad: string | null;
  circunstanciaInusual: string | null;
  signosNoConformidad: string | null;
}

/**
 * Registro del muestreo.
 *
 * Una sola llamada porque en la base es una sola transacción: el muestreo, la
 * etiqueta R.50.4.1 que exige RN-07 y el avance del lote a muestreado van
 * juntos. Separarlos dejaría material muestreado sin identificar.
 */
export function useRegistrarMuestreo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: MuestreoNuevo) => {
      /*
       * Los parámetros que en la base tienen DEFAULT salen tipados como
       * opcionales, así que hay que omitir la clave y no pasarla en null.
       */
      const { data, error } = await gmp().rpc('registrar_muestreo', {
        p_lote_id: m.loteId,
        p_cantidad_tomada: m.cantidadTomada,
        p_unidad: m.unidad,
        p_area_muestreo: m.areaMuestreo,
        p_contenedor_integro: m.contenedorIntegro,
        p_contenedor_limpio: m.contenedorLimpio,
        p_rotulado_correcto: m.rotuladoCorrecto,
        p_cantidad_contenedores: m.cantidadContenedores,
        p_destino_sobrante: m.destinoSobrante,
        ...(m.loteCoincideCertificado !== null
          ? { p_lote_coincide_certificado: m.loteCoincideCertificado }
          : {}),
        ...(m.justificacionCantidad
          ? { p_justificacion_cantidad: m.justificacionCantidad }
          : {}),
        ...(m.circunstanciaInusual
          ? { p_circunstancia_inusual: m.circunstanciaInusual }
          : {}),
        ...(m.signosNoConformidad
          ? { p_signos_no_conformidad: m.signosNoConformidad }
          : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => {
      void qc.invalidateQueries();
      avisarExito(`Muestreo ${m?.numero ?? ''} registrado y etiqueta R.50.4.1 emitida.`);
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

/* ------------------------------------------------------------------------- *
 * Productos terminados (§4.7)
 * ------------------------------------------------------------------------- */

export function useProductos() {
  return useQuery({
    queryKey: ['productos'],
    queryFn: async () => {
      const { data, error } = await gmp().from('productos').select('*').order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActualizarInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: Database['gmp']['Tables']['insumos_catalogo']['Update'];
    }) => {
      const { data, error } = await gmp()
        .from('insumos_catalogo')
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['insumos'] });
      void qc.invalidateQueries({ queryKey: ['tablero'] });
      avisarExito('Ficha del insumo actualizada.');
    },
    onError: avisarError,
  });
}

export function useCrearProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (producto: Database['gmp']['Tables']['productos']['Insert']) => {
      const { data, error } = await gmp()
        .from('productos')
        .insert(producto)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productos'] });
      avisarExito('Producto agregado al catálogo.');
    },
    onError: avisarError,
  });
}

export function useActualizarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: Database['gmp']['Tables']['productos']['Update'];
    }) => {
      const { data, error } = await gmp()
        .from('productos')
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productos'] });
      avisarExito('Ficha del producto actualizada.');
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

/* ------------------------------------------------------------------------- *
 * Stock (comercial)
 *
 * La existencia real, con movimientos: cuánto hay, de qué lote y en qué
 * depósito. Reemplaza a la lectura de `gmp.v_existencias_recibidas`, que
 * contestaba otra pregunta —cuánto entró por el circuito de calidad, que solo
 * crece— y que quedó sin pantalla desde que existe el libro de movimientos.
 * ------------------------------------------------------------------------- */

export type StockArticulo = Database['comercial']['Views']['v_stock_por_articulo']['Row'];
export type ExistenciaLote = Database['comercial']['Views']['v_existencias']['Row'];
export type MovimientoKardex = Database['comercial']['Views']['v_kardex']['Row'];
export type TipoMovimiento = Database['comercial']['Enums']['tipo_movimiento_enum'];
export type BloqueoLote = Database['gmp']['Views']['v_bloqueos_lote']['Row'];
export type MotivoBloqueo = Database['gmp']['Enums']['motivo_bloqueo_enum'];
export type MotivoAjuste = Database['comercial']['Enums']['motivo_ajuste_enum'];

/** Tipos que la base obliga a clasificar (movimientos_motivo_tipo_en_manuales). */
export const TIPOS_CON_MOTIVO_TIPIFICADO: readonly TipoMovimiento[] = [
  'ENTRADA_AJUSTE',
  'SALIDA_AJUSTE',
  'SALIDA_DESCARTE',
];

export const TEXTO_MOTIVO_AJUSTE: Record<MotivoAjuste, string> = {
  ROTURA: 'Rotura',
  DERRAME: 'Derrame',
  VENCIMIENTO: 'Vencimiento',
  DISCONTINUADO: 'Discontinuado',
  MERMA_DE_PROCESO: 'Merma de proceso',
  DIFERENCIA_DE_INVENTARIO: 'Diferencia de inventario',
  ERROR_DE_REGISTRO: 'Error de registro',
  ROBO_O_EXTRAVIO: 'Robo o extravío',
  MUESTRA_DE_ARCHIVO: 'Muestra de archivo',
  DEVOLUCION_A_PROVEEDOR: 'Devolución a proveedor',
};

/** Los tipos que hoy tienen circuito. El resto los rechaza la base por fase. */
export const TIPOS_MOVIMIENTO_MANUAL = [
  'ENTRADA_AJUSTE',
  'SALIDA_AJUSTE',
  'SALIDA_DESCARTE',
  'SALIDA_MUESTRA',
] as const satisfies readonly TipoMovimiento[];

export const TEXTO_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_PRODUCCION: 'Entrada de producción',
  ENTRADA_DEVOLUCION: 'Entrada por devolución',
  ENTRADA_AJUSTE: 'Ajuste de más',
  SALIDA_VENTA: 'Salida por venta',
  SALIDA_CONSUMO_PRODUCCION: 'Consumo de producción',
  SALIDA_MUESTRA: 'Salida de muestra',
  SALIDA_DESCARTE: 'Descarte',
  SALIDA_AJUSTE: 'Ajuste de menos',
  SALIDA_RETIRO_MERCADO: 'Retiro de mercado',
  TRANSFERENCIA_ENTRE_DEPOSITOS: 'Transferencia',
  ENTRADA_SALDO_APERTURA: 'Saldo de apertura',
  ENTRADA_PROVISTO_TERCERO: 'Entrada de material del cliente',
};

export const TEXTO_MOTIVO_BLOQUEO: Record<MotivoBloqueo, string> = {
  RETIRO_MERCADO: 'Retiro de mercado',
  NO_CONFORMIDAD: 'No conformidad',
  INVESTIGACION: 'En investigación',
  VENCIMIENTO: 'Vencido',
  DECISION_DIRECCION_TECNICA: 'Decisión de Dirección Técnica',
};

/** Existencia consolidada por artículo: la vista de reposición. */
export function useStockPorArticulo() {
  return useQuery({
    queryKey: ['stock-articulos'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_stock_por_articulo')
        .select('*')
        .order('insumo_nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Existencia por lote y depósito.
 *
 * Con `articuloId` trae el desglose de un artículo; sin él, todo. El desglose
 * es el que importa para operar: el total de un artículo no dice de qué lote
 * sacar ni de qué depósito, y esas dos son las preguntas del depósito.
 */
export function useExistenciasPorLote(articuloId?: string) {
  return useQuery({
    queryKey: ['stock-existencias', articuloId ?? 'todas'],
    queryFn: async () => {
      // Solo lo de Nail Show: el material de los tercerizados tiene su pantalla.
      let consulta = comercial().from('v_existencias').select('*').is('tercero_id', null);
      if (articuloId) consulta = consulta.eq('articulo_id', articuloId);
      const { data, error } = await consulta
        .order('insumo_nombre')
        .order('plazo_validez', { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Existencia de un lote, repartida por depósito. */
export function useExistenciasDeLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['stock-lote', loteId],
    enabled: Boolean(loteId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_existencias')
        .select('*')
        .eq('lote_insumo_id', loteId!)
        .order('deposito_numero');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Kardex de un lote: sus movimientos con saldo corrido, del más nuevo al más viejo. */
export function useKardexDeLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['kardex', loteId],
    enabled: Boolean(loteId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_kardex')
        .select('*')
        .eq('lote_insumo_id', loteId!)
        .order('orden', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Últimos movimientos de toda la planta. */
export function useKardex(limite = 200) {
  return useQuery({
    queryKey: ['kardex-general', limite],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_kardex')
        .select('*')
        .order('orden', { ascending: false })
        .limit(limite);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* Toda mutación de stock invalida lo mismo: el saldo por artículo, el desglose
   por lote, el kardex y el tablero. Centralizado para que agregar una
   operación nueva no se olvide de refrescar una pantalla. */
export function invalidarStock(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['stock-articulos'] });
  void qc.invalidateQueries({ queryKey: ['stock-existencias'] });
  void qc.invalidateQueries({ queryKey: ['stock-lote'] });
  void qc.invalidateQueries({ queryKey: ['kardex'] });
  void qc.invalidateQueries({ queryKey: ['kardex-general'] });
  void qc.invalidateQueries({ queryKey: ['recepciones'] });
  void qc.invalidateQueries({ queryKey: ['tablero'] });
  // Stock de los tercerizados y reservas: las mismas posiciones, otra pantalla.
  void qc.invalidateQueries({ queryKey: ['tercerizados'] });
}

/**
 * Carga a stock todos los lotes de una recepción, en una sola transacción.
 *
 * Va por función de base y no por varios INSERT desde acá porque PostgREST no
 * da transacción entre llamadas: con tres lotes y un fallo en el segundo,
 * quedaría media recepción cargada y sin forma de deshacerlo (RN-54).
 */
export function useCargarRecepcionAStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recepcionId: string) => {
      const { data, error } = await comercial().rpc('cargar_recepcion_a_stock', {
        p_recepcion_id: recepcionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidarStock(qc);
      const n = Array.isArray(data) ? data.length : 0;
      avisarExito(`${n} ${n === 1 ? 'lote cargado' : 'lotes cargados'} a stock.`);
    },
    onError: avisarError,
  });
}

/** Movimiento manual: ajuste por diferencia de inventario, descarte o muestra. */
export function useRegistrarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      articuloId: string;
      loteId: string;
      depositoId: string;
      tipo: TipoMovimiento;
      /** Siempre positiva: el signo lo pone el tipo, como en la base. */
      cantidad: number;
      motivo: string;
      /** Obligatorio en ajustes y descarte: lo exige la base (PG.60.18). */
      motivoTipo?: MotivoAjuste | null;
    }) => {
      const entra = m.tipo.startsWith('ENTRADA');
      const { data, error } = await comercial()
        .from('movimientos_stock')
        .insert({
          articulo_id: m.articuloId,
          lote_insumo_id: m.loteId,
          deposito_id: m.depositoId,
          tipo: m.tipo,
          cantidad: entra ? Math.abs(m.cantidad) : -Math.abs(m.cantidad),
          motivo: m.motivo,
          motivo_tipo: m.motivoTipo ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidarStock(qc);
      avisarExito('Movimiento registrado.');
    },
    onError: avisarError,
  });
}

export function useTransferirDeposito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      loteId: string;
      origenId: string;
      destinoId: string;
      cantidad: number;
      motivo: string;
    }) => {
      const { data, error } = await comercial().rpc('transferir_deposito', {
        p_lote_id: t.loteId,
        p_deposito_origen: t.origenId,
        p_deposito_destino: t.destinoId,
        p_cantidad: t.cantidad,
        p_motivo: t.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidarStock(qc);
      avisarExito('Material transferido.');
    },
    onError: avisarError,
  });
}

/**
 * Anula un movimiento con su inverso (RN-54).
 *
 * El original no se toca ni se oculta: sigue en el kardex, marcado, junto al
 * movimiento que lo corrige. Eso es lo que pide BPF y lo que un inspector
 * espera ver: el error y su corrección, no un renglón que desapareció.
 */
export function useAnularMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { data, error } = await comercial().rpc('anular_movimiento', {
        p_movimiento_id: id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidarStock(qc);
      avisarExito('Movimiento anulado con su inverso.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Bloqueo de lote (RN-51, RN-52)
 * ------------------------------------------------------------------------- */

export function useBloqueosDeLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['bloqueos', loteId],
    enabled: Boolean(loteId),
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('v_bloqueos_lote')
        .select('*')
        .eq('lote_insumo_id', loteId!)
        .order('bloqueado_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBloquearLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { loteId: string; motivo: MotivoBloqueo; detalle: string }) => {
      const { data, error } = await gmp()
        .from('bloqueos_lote')
        .insert({ lote_insumo_id: b.loteId, motivo: b.motivo, detalle: b.detalle })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bloqueos'] });
      invalidarStock(qc);
      avisarExito('Lote bloqueado. No se puede despachar hasta que se levante.');
    },
    onError: avisarError,
  });
}

export function useLevantarBloqueo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      /* `levantado_por` y `levantado_en` los pone el trigger. Mandarlos desde
         acá sería dejar que el cliente firme, y no firma el cliente. */
      const { data, error } = await gmp()
        .from('bloqueos_lote')
        .update({ levantado: true, levantado_motivo: motivo })
        .eq('id', id)
        .select();
      if (error) throw error;
      /* Un UPDATE que RLS filtra no falla: afecta cero filas. Sin esto, la
         pantalla informaría un levantamiento que nunca ocurrió. */
      if (!data || data.length === 0) {
        throw new Error(
          'No se levantó el bloqueo: tu rol no tiene esa atribución. El levantamiento es de Dirección Técnica.',
        );
      }
      return data[0];
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bloqueos'] });
      invalidarStock(qc);
      avisarExito('Bloqueo levantado.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Fórmulas de fabricación (PG.60.8) — calculadora de lote
 *
 * `database.types.ts` todavía no incluye `gmp.formulas_fabricacion`,
 * `gmp.formula_componentes` ni `gmp.densidades_referencia`: la migración
 * `20260917110000_gmp_formulas_fabricacion` está en el repositorio, pero esta
 * sesión no tuvo credenciales para confirmar `supabase db push` ni para correr
 * `npm run db:types` contra el proyecto alojado. Los tipos de fila de acá
 * están escritos a mano como puente temporal, en contra de CLAUDE.md §6. En
 * cuanto se regeneren los tipos, hay que borrar este bloque de tipos e `as
 * any` y usar `Database['gmp']['Tables'][...]`, igual que el resto del
 * archivo.
 * ------------------------------------------------------------------------- */

export type EstadoDocumento =
  | 'EN_DESARROLLO'
  | 'BORRADOR'
  | 'LISTO_PARA_EMITIR'
  | 'VIGENTE'
  | 'EN_REVISION'
  | 'DADO_DE_BAJA';

export type FuenteDensidadDb =
  'LITERATURA' | 'CERTIFICADO_PROVEEDOR' | 'MEDICION_PROPIA' | 'FARMACOPEA';

export interface FormulaFabricacionRow {
  id: string;
  producto_id: string;
  variedad: string | null;
  codigo_me: string | null;
  version: string;
  densidad_producto: number | null;
  densidad_temp_c: number | null;
  rendimiento: number;
  estado: EstadoDocumento;
}

export interface DensidadReferenciaRow {
  id: string;
  nombre: string;
  insumo_id: string | null;
  densidad_ref: number | null;
  temp_ref_c: number;
  beta_k: number | null;
  fuente: FuenteDensidadDb;
  activo: boolean;
  /** Ajuste rho(T) = a0 + a1·T + … (20260922210000). Null en las que solo tienen punto. */
  a0: number | null;
  a1: number | null;
  a2: number | null;
  a3: number | null;
  a4: number | null;
  valido_desde_c: number;
  valido_hasta_c: number;
  cas: string | null;
  categoria: string | null;
  calidad: string | null;
}

export interface FormulaComponenteRow {
  id: string;
  orden: number;
  insumo_id: string | null;
  nombre_libre: string | null;
  porcentaje_pp: number | null;
  es_csp: boolean;
  se_mide_a_volumen: boolean;
  etapa: string | null;
  insumo: {
    nombre: string;
    codigo_interno: string | null;
    /** Densidad por defecto del insumo (20260923160000). */
    densidad_defecto: DensidadReferenciaRow | null;
  } | null;
  densidad: DensidadReferenciaRow | null;
}

export interface RespuestaTabla<T> {
  data: T | null;
  error: (Error & { code?: string; details?: string }) | null;
}

export interface ConsultaTabla<T> extends PromiseLike<RespuestaTabla<T>> {
  select(columnas?: string): ConsultaTabla<T>;
  insert(valores: Record<string, unknown> | Record<string, unknown>[]): ConsultaTabla<T>;
  update(valores: Record<string, unknown>): ConsultaTabla<T>;
  delete(): ConsultaTabla<T>;
  eq(columna: string, valor: string | number | boolean): ConsultaTabla<T>;
  in(columna: string, valores: readonly (string | number)[]): ConsultaTabla<T>;
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaTabla<T>;
  single(): PromiseLike<RespuestaTabla<T>>;
}

/**
 * Punto de entrada a una tabla que la migración ya creó pero que
 * `database.types.ts` todavía no conoce (ver la nota de arriba). El único
 * `as` de todo el bloque vive acá: a partir de acá, `ConsultaTabla<T>` tipa
 * cada método de la cadena, así que el resto del código queda seguro.
 *
 * `.bind(cliente)` antes del cast: sin él, `@typescript-eslint/unbound-method`
 * marca el método suelto, y llamarlo despegado de `cliente` podría perder el
 * `this` que `PostgrestClient` necesita.
 */
function tablaSinTipar<T>(nombre: string): ConsultaTabla<T> {
  const cliente = gmp();
  const desde = cliente.from.bind(cliente) as unknown as (tabla: string) => unknown;
  return desde(nombre) as ConsultaTabla<T>;
}

/**
 * Fórmulas para el selector de la calculadora.
 *
 * Sin filtrar por estado: hasta un borrador sirve para una vista previa. Si
 * todavía no se cargó ninguna, `data` vuelve `[]` y el selector se muestra
 * vacío en vez de romper.
 *
 * Las vigentes van primero: es la fórmula oficial, y en una lista larga no
 * tiene que competir por posición con un borrador a medio cargar.
 */
export function useFormulasFabricacion() {
  return useQuery({
    queryKey: ['formulas-fabricacion'],
    queryFn: async () => {
      const { data, error } = await tablaSinTipar<
        (FormulaFabricacionRow & { producto: { nombre: string } | null })[]
      >('formulas_fabricacion')
        .select(
          'id, producto_id, variedad, codigo_me, version, densidad_producto, densidad_temp_c, rendimiento, estado, producto:productos(nombre)',
        )
        .order('version', { ascending: false });
      if (error) throw error;
      const filas = data ?? [];
      return filas
        .slice()
        .sort(
          (a, b) => (a.estado === 'VIGENTE' ? 0 : 1) - (b.estado === 'VIGENTE' ? 0 : 1),
        );
    },
  });
}

/**
 * Fórmula completa —con el nombre del producto, y sus componentes con la
 * densidad de referencia— para explotarla con `calcularLote` o para editarla.
 */
export function useFormulaCompleta(formulaId: string | undefined) {
  return useQuery({
    queryKey: ['formula-completa', formulaId],
    enabled: Boolean(formulaId),
    queryFn: async () => {
      const { data: formula, error } = await tablaSinTipar<
        FormulaFabricacionRow & { producto: { nombre: string } | null }
      >('formulas_fabricacion')
        .select('*, producto:productos(nombre)')
        .eq('id', formulaId!)
        .single();
      if (error) throw error;

      const { data: componentes, error: errorComp } = await tablaSinTipar<
        FormulaComponenteRow[]
      >('formula_componentes')
        .select(
          // Hay dos FK entre insumos y densidades (una en cada sentido): se
          // nombra la del insumo para que PostgREST no las confunda.
          '*, insumo:insumos_catalogo(nombre, codigo_interno, densidad_defecto:densidades_referencia!insumos_catalogo_densidad_referencia_id_fkey(*)), densidad:densidades_referencia(*)',
        )
        .eq('formula_id', formulaId!)
        .order('orden');
      if (errorComp) throw errorComp;

      return {
        formula: formula as FormulaFabricacionRow & {
          producto: { nombre: string } | null;
        },
        componentes: componentes ?? [],
      };
    },
  });
}

/** Densidades de referencia activas, para elegir la de un componente que se mide a volumen. */
export function useDensidadesReferencia() {
  return useQuery({
    queryKey: ['densidades-referencia'],
    queryFn: async () => {
      const { data, error } = await tablaSinTipar<DensidadReferenciaRow[]>(
        'densidades_referencia',
      )
        .select('id, nombre, insumo_id, densidad_ref, temp_ref_c, beta_k, fuente, activo')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Alta de una fórmula nueva, en BORRADOR. Solo Dirección Técnica (RLS `formulas_escribe_dt`). */
export function useCrearFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: {
      productoId: string;
      variedad: string | null;
      codigoMe: string | null;
      version: string;
    }) => {
      const { data, error } = await tablaSinTipar<FormulaFabricacionRow>(
        'formulas_fabricacion',
      )
        .insert({
          producto_id: f.productoId,
          variedad: f.variedad,
          codigo_me: f.codigoMe,
          version: f.version,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FormulaFabricacionRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['formulas-fabricacion'] });
      avisarExito('Fórmula creada en borrador.');
    },
    onError: avisarError,
  });
}

/**
 * Cambios sobre una fórmula: densidad del producto, temperatura de
 * referencia, o el paso a VIGENTE.
 *
 * El paso a VIGENTE no manda `aprobada_por` ni `aprobada_en`: los completa
 * `gmp.fn_formula_aprobacion` (20260921090000). Mandarlos desde acá sería
 * dejar que el cliente firme por Dirección Técnica, y no firma el cliente.
 */
export function useActualizarFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: Partial<{
        densidad_producto: number | null;
        densidad_temp_c: number | null;
        estado: EstadoDocumento;
      }>;
    }) => {
      const { data, error } = await tablaSinTipar<FormulaFabricacionRow>(
        'formulas_fabricacion',
      )
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as FormulaFabricacionRow;
    },
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: ['formulas-fabricacion'] });
      void qc.invalidateQueries({ queryKey: ['formula-completa', f.id] });
      avisarExito(
        f.estado === 'VIGENTE' ? 'Fórmula marcada como vigente.' : 'Fórmula actualizada.',
      );
    },
    onError: avisarError,
  });
}

/** Agrega un componente a una fórmula en borrador (RLS `componentes_escribe_dt`). */
export function useCrearComponenteFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      formulaId: string;
      orden: number;
      insumoId: string | null;
      nombreLibre: string | null;
      porcentajePP: number | null;
      esCsp: boolean;
      seMideAVolumen: boolean;
      densidadId: string | null;
      etapa: string | null;
    }) => {
      const { data, error } = await tablaSinTipar<FormulaComponenteRow>(
        'formula_componentes',
      )
        .insert({
          formula_id: c.formulaId,
          orden: c.orden,
          insumo_id: c.insumoId,
          nombre_libre: c.nombreLibre,
          porcentaje_pp: c.porcentajePP,
          es_csp: c.esCsp,
          se_mide_a_volumen: c.seMideAVolumen,
          densidad_id: c.densidadId,
          etapa: c.etapa,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FormulaComponenteRow;
    },
    onSuccess: (_c, variables) => {
      void qc.invalidateQueries({ queryKey: ['formula-completa', variables.formulaId] });
      avisarExito('Componente agregado.');
    },
    onError: avisarError,
  });
}

/** Quita un componente de una fórmula en borrador (RLS `componentes_borra_dt`). */
export function useEliminarComponenteFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; formulaId: string }) => {
      const { error } = await tablaSinTipar<null>('formula_componentes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_v, variables) => {
      void qc.invalidateQueries({ queryKey: ['formula-completa', variables.formulaId] });
      avisarExito('Componente quitado.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Procedimiento de la fórmula (PG.60.8), versionado
 *
 * Cada edición es una versión nueva (20260924140000): se muestra la última y el
 * historial queda. Editan Dirección Técnica y Gerencia de Producción.
 * ------------------------------------------------------------------------- */

export type ProcedimientoVersion =
  Database['gmp']['Tables']['formula_procedimientos']['Row'];

export function useProcedimientos(formulaId: string | undefined) {
  return useQuery({
    queryKey: ['procedimientos', formulaId],
    enabled: Boolean(formulaId),
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('formula_procedimientos')
        .select('*')
        .eq('formula_id', formulaId!)
        .order('version', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGuardarProcedimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      formulaId: string;
      texto: string;
      motivo: string | null;
    }) => {
      const { error } = await gmp().from('formula_procedimientos').insert({
        formula_id: p.formulaId,
        texto: p.texto,
        motivo_cambio: p.motivo,
        // La versión la pone la base (trg_procedimiento_version).
        version: 0,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['procedimientos', v.formulaId] });
      avisarExito('Procedimiento guardado como versión nueva.');
    },
    onError: avisarError,
  });
}
