/**
 * Especificaciones (20260930100000), equipos y órdenes de producción con su
 * registro de lote (20260930110000).
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { comercial, gmp } from './supabase';

type TablasGmp = Database['gmp']['Tables'];
type Enums = Database['gmp']['Enums'];
type Json = Database['gmp']['Tables']['op_etapas']['Row']['datos'];

/* ---------------------------- Especificaciones --------------------------- */

export type EstadoDocumento = Enums['estado_documento_enum'];
export type GrupoParametro = Enums['grupo_parametro_enum'];
export type TipoCriterio = Enums['tipo_criterio_enum'];

/** `tipo_producto` es text en la base, con un CHECK que fija estos tres valores. */
export type Especificacion = Omit<
  TablasGmp['especificaciones']['Row'],
  'tipo_producto'
> & {
  tipo_producto: 'SEMIELABORADO' | 'GRANEL' | 'TERMINADO';
};

export type EspecFormula = TablasGmp['espec_formula']['Row'];

export type EspecParametro = TablasGmp['espec_parametros']['Row'];

export const TEXTO_GRUPO: Record<GrupoParametro, string> = {
  FISICOQUIMICO: 'Fisicoquímicas',
  FUNCIONAL: 'Funcionales',
  ORGANOLEPTICO: 'Organolépticas',
  MICROBIOLOGICO: 'Microbiológicas',
};

/** «0,9100 – 0,9200 g/ml», «≥ 95 %», el texto o la norma. */
export function textoCriterio(p: EspecParametro): string {
  const u = p.unidad ? ` ${p.unidad}` : '';
  switch (p.tipo_criterio) {
    case 'RANGO':
      return `${p.valor_min} – ${p.valor_max}${u}`;
    case 'MINIMO':
      return `≥ ${p.valor_min}${u}`;
    case 'MAXIMO':
      return `≤ ${p.valor_max}${u}`;
    case 'REFERENCIA_EXTERNA':
      return p.referencia_norma ?? '';
    case 'BINARIO':
      return 'Cumple / no cumple';
    default:
      return p.valor_texto ?? '';
  }
}

/** Motor de evaluación (§7.3), espejo de gmp.cumple_parametro. */
export function cumpleNumerico(p: EspecParametro, valor: number): boolean | null {
  if (p.tipo_criterio === 'RANGO') return valor >= p.valor_min! && valor <= p.valor_max!;
  if (p.tipo_criterio === 'MINIMO') return valor >= p.valor_min!;
  if (p.tipo_criterio === 'MAXIMO') return valor <= p.valor_max!;
  return null;
}

export const esNumerico = (t: TipoCriterio) =>
  t === 'RANGO' || t === 'MINIMO' || t === 'MAXIMO';

export function useEspecificaciones() {
  return useQuery({
    queryKey: ['especificaciones'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('especificaciones')
        .select('*')
        .order('codigo_poe', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEspecificacionCompleta(id: string | null | undefined) {
  return useQuery({
    queryKey: ['especificacion', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [e, f, p] = await Promise.all([
        gmp().from('especificaciones').select('*').eq('id', id!).single(),
        gmp()
          .from('espec_formula')
          .select('*')
          .eq('especificacion_id', id!)
          .order('orden'),
        gmp()
          .from('espec_parametros')
          .select('*')
          .eq('especificacion_id', id!)
          .order('orden'),
      ]);
      if (e.error) throw e.error;
      return {
        especificacion: e.data as Especificacion,
        formula: (f.data ?? []).filter((x) => !x.quitado),
        parametros: (p.data ?? []).filter((x) => !x.quitado),
      };
    },
  });
}

function useInvalidarEspec() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['especificaciones'] });
    void qc.invalidateQueries({ queryKey: ['especificacion'] });
  };
}

export function useGuardarEspecificacion() {
  const inv = useInvalidarEspec();
  return useMutation({
    mutationFn: async (e: Partial<Especificacion> & { id?: string }) => {
      if (e.id) {
        const { id, ...cambios } = e;
        const { error } = await gmp()
          .from('especificaciones')
          .update(cambios)
          .eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await gmp()
        .from('especificaciones')
        // La base valida los obligatorios (NOT NULL); acá el tipo es parcial.
        .insert(e as TablasGmp['especificaciones']['Insert'])
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      inv();
      avisarExito('Especificación guardada.');
    },
    onError: avisarError,
  });
}

export function useGuardarRenglonEspec() {
  const inv = useInvalidarEspec();
  return useMutation({
    mutationFn: async (r: {
      tabla: 'espec_formula' | 'espec_parametros';
      id?: string;
      fila: Record<string, unknown>;
    }) => {
      // La base valida los obligatorios; acá `fila` llega sin tipo de tabla.
      const { error } =
        r.tabla === 'espec_formula'
          ? await (() => {
              const t = gmp().from('espec_formula');
              const f = r.fila as TablasGmp['espec_formula']['Insert'];
              return r.id ? t.update(f).eq('id', r.id) : t.insert(f);
            })()
          : await (() => {
              const t = gmp().from('espec_parametros');
              const f = r.fila as TablasGmp['espec_parametros']['Insert'];
              return r.id ? t.update(f).eq('id', r.id) : t.insert(f);
            })();
      if (error) throw error;
    },
    onSuccess: inv,
    onError: avisarError,
  });
}

export function useAprobarEspecificacion() {
  const inv = useInvalidarEspec();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await gmp().rpc('aprobar_especificacion', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      inv();
      avisarExito('Especificación aprobada: rige desde hoy.');
    },
    onError: avisarError,
  });
}

export function useNuevaVersionEspecificacion() {
  const inv = useInvalidarEspec();
  return useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { data, error } = await gmp().rpc('nueva_version_especificacion', {
        p_id: v.id,
        p_motivo: v.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      inv();
      avisarExito('Nueva versión en borrador.');
    },
    onError: avisarError,
  });
}

/* --------------------------------- Equipos -------------------------------- */

export type Equipo = TablasGmp['equipos']['Row'];

export function useEquipos() {
  return useQuery({
    queryKey: ['equipos'],
    queryFn: async () => {
      const { data, error } = await gmp().from('equipos').select('*').order('codigo');
      if (error) throw error;
      return (data ?? []).filter((e) => e.activo);
    },
  });
}

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { codigo: string; nombre: string; tipo: string }) => {
      const { error } = await gmp().from('equipos').insert(e);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipos'] });
      avisarExito('Equipo dado de alta.');
    },
    onError: avisarError,
  });
}

/* --------------------------- Órdenes de producción ------------------------ */

export type EstadoOrden = Enums['estado_orden_enum'];
export type EtapaOrden = Enums['etapa_orden_enum'];

export const ETAPAS: { etapa: EtapaOrden; titulo: string; calidad?: boolean }[] = [
  { etapa: 'PESADA', titulo: 'Pesada de materias primas' },
  { etapa: 'ELABORACION', titulo: 'Elaboración del producto a granel' },
  { etapa: 'MUESTREO_GRANEL', titulo: 'Muestreo de producto a granel' },
  {
    etapa: 'CC_GRANEL',
    titulo: 'Control de calidad de producto a granel',
    calidad: true,
  },
  { etapa: 'FRACCIONAMIENTO', titulo: 'Fraccionamiento de producto a granel' },
  { etapa: 'MUESTREO_PT', titulo: 'Muestreo de producto terminado' },
  { etapa: 'CC_PT', titulo: 'Control de calidad de producto terminado', calidad: true },
  { etapa: 'CONTRAMUESTRA', titulo: 'Archivo de contramuestra' },
  {
    etapa: 'REVISION',
    titulo: 'Revisión de documentación del lote (batch record)',
    calidad: true,
  },
];

export type OrdenProduccion = TablasGmp['ordenes_produccion']['Row'];

/** Datos de una etapa: la forma la fija la pantalla de cada etapa. */
export type DatosEtapa = Record<string, unknown>;

/** `datos` es jsonb en la base; acá, siempre un objeto. */
export type EtapaRegistrada = Omit<TablasGmp['op_etapas']['Row'], 'datos'> & {
  datos: DatosEtapa;
};

export function useOrdenes() {
  return useQuery({
    queryKey: ['ordenes'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('ordenes_produccion')
        .select('*')
        .order('abierta_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOrden(id: string | undefined) {
  return useQuery({
    queryKey: ['orden', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [o, e] = await Promise.all([
        gmp().from('ordenes_produccion').select('*').eq('id', id!).single(),
        gmp().from('op_etapas').select('*').eq('orden_id', id!),
      ]);
      if (o.error) throw o.error;
      if (e.error) throw e.error;
      return {
        orden: o.data,
        etapas: (e.data ?? []) as EtapaRegistrada[],
      };
    },
  });
}

function useInvalidarOrden() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['ordenes'] });
    if (id) void qc.invalidateQueries({ queryKey: ['orden', id] });
    void qc.invalidateQueries({ queryKey: ['ordenes-de-pedido'] });
  };
}

/**
 * Órdenes abiertas con las etapas ya registradas: de acá salen las tareas de
 * planta (la clave cuelga de 'ordenes' para refrescarse al guardar una etapa).
 */
export function useOrdenesAbiertasConEtapas() {
  return useQuery({
    queryKey: ['ordenes', 'abiertas-con-etapas'],
    queryFn: async () => {
      const { data, error } = await gmp()
        .from('ordenes_produccion')
        .select('*, op_etapas(etapa)')
        .eq('estado', 'ABIERTA')
        .order('jornada');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Vencimiento como lo escribe planta: «MM/AA» (D-orden-producto-1). Por
 * defecto, la fecha de elaboración más dos años.
 */
export const vencimientoPorDefecto = (jornada: Date) => {
  const d = new Date(jornada.getFullYear() + 2, jornada.getMonth(), 1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
};

/** «MM/AA» → último día de ese mes (AAAA-MM-DD), o null si no es válido. */
export const vencimientoISO = (texto: string): string | null => {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  const ultimo = new Date(anio, mes, 0).getDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
};

/**
 * Producto que no trae fórmula: se envasa un granel comprado
 * (D-orden-producto-1). Se arma una fórmula en borrador con ese granel al
 * 100 %, así la pesada registra qué lote de granel se usó.
 */
export function useCrearFormulaEnvasado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { productoId: string; granelId: string }) => {
      const { data, error } = await gmp()
        .from('formulas_fabricacion')
        .insert({ producto_id: a.productoId, version: 'Envasado', estado: 'BORRADOR' })
        .select('id')
        .single();
      if (error) throw error;
      const { error: e2 } = await gmp().from('formula_componentes').insert({
        formula_id: data.id,
        orden: 1,
        insumo_id: a.granelId,
        porcentaje_pp: 100,
        etapa: 'Envasado del granel',
      });
      if (e2) throw e2;
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['formulas-fabricacion'] }),
    onError: avisarError,
  });
}

/** DT completa la especificación de una orden que se abrió sin ella. */
export function useAsignarEspecificacionOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { ordenId: string; especificacionId: string }) => {
      const { error } = await (gmp() as unknown as SupabaseClient).rpc(
        'asignar_especificacion_orden',
        { p_orden_id: a.ordenId, p_especificacion_id: a.especificacionId },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ordenes'] });
      avisarExito('Especificación asignada.');
    },
    onError: avisarError,
  });
}

export function useAbrirOrden() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: async (o: {
      formula_id: string;
      producto_id: string;
      jornada: string;
      partida: number;
      presentacion: number;
      presentacion_texto: string | null;
      cantidad_teorica: number;
      unidad: string;
      vencimiento: string | null;
      especificacion_id: string | null;
      pedidoId: string | null;
      /** D-tandas-1: las que se espera envasar, para mostrar lo pendiente. */
      unidades_previstas?: number | null;
    }) => {
      const { pedidoId, vencimiento, especificacion_id, unidades_previstas, ...fila } = o;
      const { data, error } = await gmp()
        .from('ordenes_produccion')
        // numero, numero_lote y vencimiento_texto los asigna un trigger de la base.
        .insert({
          ...fila,
          ...(vencimiento ? { vencimiento } : {}),
          ...(especificacion_id ? { especificacion_id } : {}),
          ...(unidades_previstas ? { unidades_previstas } : {}),
        } as TablasGmp['ordenes_produccion']['Insert'])
        .select('id, numero')
        .single();
      if (error) throw error;
      if (pedidoId) {
        const { error: e2 } = await comercial().from('pedido_ordenes').insert({
          pedido_id: pedidoId,
          orden_id: data.id,
        });
        if (e2) throw e2;
      }
      return data;
    },
    onSuccess: (d) => {
      inv(d.id);
      avisarExito(`Orden ${d.numero} abierta.`);
    },
    onError: avisarError,
  });
}

/** Registrar («Realizó») o corregir una etapa antes del control. */
export function useGuardarEtapa() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: async (e: {
      ordenId: string;
      etapa: EtapaOrden;
      id?: string;
      datos: DatosEtapa;
      observaciones: string | null;
    }) => {
      const t = gmp().from('op_etapas');
      const { error } = e.id
        ? await t
            .update({ datos: e.datos as Json, observaciones: e.observaciones })
            .eq('id', e.id)
        : await t.insert({
            orden_id: e.ordenId,
            etapa: e.etapa,
            datos: e.datos as Json,
            observaciones: e.observaciones,
          });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      inv(v.ordenId);
      avisarExito('Etapa registrada.');
    },
    onError: avisarError,
  });
}

/** «Controló»: cierra la etapa. La base pone quién y cuándo. */
export function useControlarEtapa() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: async (e: { id: string; ordenId: string; usuarioId: string }) => {
      const { data, error } = await gmp()
        .from('op_etapas')
        .update({ controlo_por: e.usuarioId, controlo_en: new Date().toISOString() })
        .eq('id', e.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No se pudo controlar la etapa.');
    },
    onSuccess: (_d, v) => {
      inv(v.ordenId);
      avisarExito('Etapa controlada: queda cerrada.');
    },
    onError: avisarError,
  });
}

export function useLiberarOrden() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: async (l: { id: string; aprobado: boolean; motivo: string | null }) => {
      const { error } = await gmp().rpc('liberar_orden', {
        p_id: l.id,
        p_aprobado: l.aprobado,
        ...(l.motivo === null ? {} : { p_motivo: l.motivo }),
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      inv(v.id);
      avisarExito(v.aprobado ? 'Lote liberado: ya se puede vender.' : 'Lote rechazado.');
    },
    onError: avisarError,
  });
}

export function useAnularOrden() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: async (a: { id: string; motivo: string }) => {
      const { error } = await gmp().rpc('anular_orden', {
        p_id: a.id,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      inv(v.id);
      avisarExito('Orden anulada.');
    },
    onError: avisarError,
  });
}

export function useFaltantesLiberacion(id: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['orden', id, 'faltantes'],
    enabled: Boolean(id) && habilitado,
    queryFn: async () => {
      const { data, error } = await gmp().rpc('faltantes_liberacion', { p_id: id! });
      if (error) throw error;
      return data;
    },
  });
}

/** Renglones de pesada teóricos: gmp.calcular_lote con la masa de la orden. */
export function usePesadaTeorica(
  formulaId: string | undefined,
  cantidad: number | undefined,
  unidad = 'kg',
) {
  return useQuery({
    queryKey: ['pesada-teorica', formulaId, cantidad, unidad],
    enabled: Boolean(formulaId) && Boolean(cantidad),
    queryFn: async () => {
      // En litros, la base pasa a masa con la densidad de la fórmula.
      const { data, error } = await gmp().rpc('calcular_lote', {
        p_formula_id: formulaId!,
        ...(unidad === 'L' ? { p_volumen_l: cantidad! } : { p_masa_kg: cantidad! }),
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useOrdenesDePedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['ordenes-de-pedido', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('pedido_ordenes')
        .select('orden_id')
        .eq('pedido_id', pedidoId!);
      if (error) return [];
      return (data ?? []).map((r) => r.orden_id);
    },
  });
}

/** Una fila de comercial.v_trazabilidad_orden (§8.4). */
export type FilaTrazabilidad =
  Database['comercial']['Views']['v_trazabilidad_orden']['Row'];

export function useTrazabilidadOrden(ordenId: string | undefined) {
  return useQuery({
    queryKey: ['orden', ordenId, 'trazabilidad'],
    enabled: Boolean(ordenId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_trazabilidad_orden')
        .select('*')
        .eq('orden_id', ordenId!)
        .order('momento', { ascending: true });
      if (error) return [];
      return data ?? [];
    },
  });
}

/** Una fila de lo envasado en el día (gmp.orden_tandas, D-tandas-1). */
export interface TandaFila {
  numero: number;
  fecha: string;
  producto_id: string;
  unidades: number;
  observaciones: string | null;
  registrada_por: string;
}

/* orden_tandas entra en los tipos cuando se regeneren con 20261028140000. */
const gmpST = () => gmp() as unknown as SupabaseClient;

export function useTandasOrden(ordenId: string | undefined) {
  return useQuery({
    queryKey: ['orden', ordenId, 'tandas'],
    enabled: Boolean(ordenId),
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('orden_tandas')
        .select('numero, fecha, producto_id, unidades, observaciones, registrada_por')
        .eq('orden_id', ordenId!)
        .order('numero');
      if (error) throw error;
      const filas: TandaFila[] = data ?? [];
      return filas;
    },
  });
}

/** Lo que salió hoy; con `finaliza`, también termina la orden. */
export function useRegistrarTanda() {
  const inv = useInvalidarOrden();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      ordenId: string;
      fecha: string;
      reparto: { producto_id: string; unidades: number }[];
      observaciones: string | null;
      finaliza: boolean;
      cantidadObtenida: number | null;
    }) => {
      const { error } = await (comercial() as unknown as SupabaseClient).rpc(
        'registrar_tanda',
        {
          p_orden_id: t.ordenId,
          p_fecha: t.fecha,
          p_reparto: t.reparto,
          p_observaciones: t.observaciones,
          p_finaliza: t.finaliza,
          p_cantidad_obtenida: t.cantidadObtenida,
        },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      inv(v.ordenId);
      for (const k of [
        'stock-pt-lotes',
        'stock-punto-venta',
        'stock-articulos',
        'kardex',
      ])
        void qc.invalidateQueries({ queryKey: [k] });
      avisarExito(
        v.finaliza
          ? 'Orden terminada: lo envasado está en la fábrica, retenido hasta que la DT libere.'
          : 'Cargado: entró a la fábrica (retenido) y se descontaron los insumos del día.',
      );
    },
    onError: avisarError,
  });
}

/** Lo envasado hasta ahora y lo que falta, si se cargaron las previstas. */
export function totalesTandas(tandas: TandaFila[], previstas: number | null) {
  const hechas = tandas.reduce((a, t) => a + Number(t.unidades), 0);
  return {
    hechas,
    pendientes: previstas === null ? null : Math.max(previstas - hechas, 0),
  };
}
