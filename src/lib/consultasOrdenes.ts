/**
 * Especificaciones (20260930100000), equipos y órdenes de producción con su
 * registro de lote (20260930110000).
 *
 * PUENTE DE TIPOS hasta aplicar las migraciones y correr `npm run db:types`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avisarError, avisarExito, type ConsultaTabla } from './consultas';
import { tablaComercial } from './consultasComercial';
import { gmp } from './supabase';

function tablaGmp<T>(nombre: string): ConsultaTabla<T> {
  const cliente = gmp();
  const desde = cliente.from.bind(cliente) as unknown as (tabla: string) => unknown;
  return desde(nombre) as ConsultaTabla<T>;
}

async function rpcGmp<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const cliente = gmp();
  const rpc = cliente.rpc.bind(cliente) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: T | null; error: Error | null }>;
  const { data, error } = await rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/* ---------------------------- Especificaciones --------------------------- */

export type EstadoDocumento =
  | 'EN_DESARROLLO'
  | 'BORRADOR'
  | 'LISTO_PARA_EMITIR'
  | 'VIGENTE'
  | 'EN_REVISION'
  | 'DADO_DE_BAJA';
export type GrupoParametro =
  'FISICOQUIMICO' | 'FUNCIONAL' | 'ORGANOLEPTICO' | 'MICROBIOLOGICO';
export type TipoCriterio =
  | 'RANGO'
  | 'MINIMO'
  | 'MAXIMO'
  | 'VALOR_TEXTO'
  | 'CONTRA_PATRON'
  | 'REFERENCIA_EXTERNA'
  | 'BINARIO';

export interface Especificacion {
  id: string;
  codigo_poe: string;
  version: string;
  variedad: string | null;
  producto_id: string | null;
  tipo_producto: 'SEMIELABORADO' | 'GRANEL' | 'TERMINADO';
  denominacion: string;
  composicion_inci: string | null;
  condiciones_almacenamiento: string | null;
  instrucciones_muestreo: string | null;
  periodo_reanalisis_meses: number | null;
  vida_util_meses: number;
  estado: EstadoDocumento;
  vigencia_desde: string | null;
  motivo_cambio: string | null;
  emitida_por: string;
  creado_en: string;
  aprobada_por: string | null;
  aprobada_en: string | null;
}

export interface EspecFormula {
  id: string;
  especificacion_id: string;
  orden: number;
  componente: string;
  porcentaje_min: number | null;
  porcentaje_max: number | null;
  es_csp: boolean;
  quitado: boolean;
}

export interface EspecParametro {
  id: string;
  especificacion_id: string;
  orden: number;
  nombre: string;
  grupo: GrupoParametro;
  tipo_criterio: TipoCriterio;
  valor_min: number | null;
  valor_max: number | null;
  valor_texto: string | null;
  unidad: string | null;
  metodo_ensayo: string | null;
  condicion_ensayo: string | null;
  referencia_norma: string | null;
  obligatorio: boolean;
  quitado: boolean;
}

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
      const { data, error } = await tablaGmp<Especificacion[]>('especificaciones')
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
        tablaGmp<Especificacion>('especificaciones').select('*').eq('id', id!).single(),
        tablaGmp<EspecFormula[]>('espec_formula')
          .select('*')
          .eq('especificacion_id', id!)
          .order('orden'),
        tablaGmp<EspecParametro[]>('espec_parametros')
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
        const { error } = await tablaGmp('especificaciones').update(cambios).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await tablaGmp<{ id: string }>('especificaciones')
        .insert(e)
        .select('id')
        .single();
      if (error) throw error;
      return data!.id;
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
      const t = tablaGmp(r.tabla);
      const { error } = r.id
        ? await t.update(r.fila).eq('id', r.id)
        : await t.insert(r.fila);
      if (error) throw error;
    },
    onSuccess: inv,
    onError: avisarError,
  });
}

export function useAprobarEspecificacion() {
  const inv = useInvalidarEspec();
  return useMutation({
    mutationFn: (id: string) => rpcGmp('aprobar_especificacion', { p_id: id }),
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
    mutationFn: (v: { id: string; motivo: string }) =>
      rpcGmp<string>('nueva_version_especificacion', { p_id: v.id, p_motivo: v.motivo }),
    onSuccess: () => {
      inv();
      avisarExito('Nueva versión en borrador.');
    },
    onError: avisarError,
  });
}

/* --------------------------------- Equipos -------------------------------- */

export interface Equipo {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  activo: boolean;
}

export function useEquipos() {
  return useQuery({
    queryKey: ['equipos'],
    queryFn: async () => {
      const { data, error } = await tablaGmp<Equipo[]>('equipos')
        .select('*')
        .order('codigo');
      if (error) throw error;
      return (data ?? []).filter((e) => e.activo);
    },
  });
}

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { codigo: string; nombre: string; tipo: string }) => {
      const { error } = await tablaGmp('equipos').insert(e);
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

export type EstadoOrden = 'ABIERTA' | 'TERMINADA' | 'LIBERADA' | 'RECHAZADA' | 'ANULADA';
export type EtapaOrden =
  | 'PESADA'
  | 'ELABORACION'
  | 'MUESTREO_GRANEL'
  | 'CC_GRANEL'
  | 'FRACCIONAMIENTO'
  | 'MUESTREO_PT'
  | 'CC_PT'
  | 'CONTRAMUESTRA'
  | 'REVISION';

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

export interface OrdenProduccion {
  id: string;
  numero: string;
  formula_id: string;
  producto_id: string;
  especificacion_id: string | null;
  procedimiento_version: number | null;
  jornada: string;
  partida: number;
  presentacion: number;
  presentacion_texto: string | null;
  numero_lote: string;
  vencimiento: string;
  vencimiento_texto: string;
  cantidad_teorica: number;
  unidad: string;
  cantidad_obtenida: number | null;
  unidades_obtenidas: number | null;
  estado: EstadoOrden;
  observaciones: string | null;
  abierta_por: string;
  abierta_en: string;
  terminada_por: string | null;
  terminada_en: string | null;
  liberada_por: string | null;
  liberada_en: string | null;
  motivo_cierre: string | null;
}

/** Datos de una etapa: la forma la fija la pantalla de cada etapa. */
export type DatosEtapa = Record<string, unknown>;

export interface EtapaRegistrada {
  id: string;
  orden_id: string;
  etapa: EtapaOrden;
  datos: DatosEtapa;
  observaciones: string | null;
  realizo_por: string;
  realizo_en: string;
  controlo_por: string | null;
  controlo_en: string | null;
}

export function useOrdenes() {
  return useQuery({
    queryKey: ['ordenes'],
    queryFn: async () => {
      const { data, error } = await tablaGmp<OrdenProduccion[]>('ordenes_produccion')
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
        tablaGmp<OrdenProduccion>('ordenes_produccion')
          .select('*')
          .eq('id', id!)
          .single(),
        tablaGmp<EtapaRegistrada[]>('op_etapas').select('*').eq('orden_id', id!),
      ]);
      if (o.error) throw o.error;
      if (e.error) throw e.error;
      return { orden: o.data as OrdenProduccion, etapas: e.data ?? [] };
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
    }) => {
      const { pedidoId, vencimiento, especificacion_id, ...fila } = o;
      const { data, error } = await tablaGmp<{ id: string; numero: string }>(
        'ordenes_produccion',
      )
        .insert({
          ...fila,
          ...(vencimiento ? { vencimiento } : {}),
          ...(especificacion_id ? { especificacion_id } : {}),
        })
        .select('id, numero')
        .single();
      if (error) throw error;
      if (pedidoId) {
        const { error: e2 } = await tablaComercial('pedido_ordenes').insert({
          pedido_id: pedidoId,
          orden_id: data!.id,
        });
        if (e2) throw e2;
      }
      return data!;
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
      const t = tablaGmp('op_etapas');
      const { error } = e.id
        ? await t
            .update({ datos: e.datos, observaciones: e.observaciones })
            .eq('id', e.id)
        : await t.insert({
            orden_id: e.ordenId,
            etapa: e.etapa,
            datos: e.datos,
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
      const { data, error } = await tablaGmp<{ id: string }[]>('op_etapas')
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

export function useTerminarOrden() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: (t: { id: string; cantidad: number; unidades: number }) =>
      rpcGmp('terminar_orden', {
        p_id: t.id,
        p_cantidad: t.cantidad,
        p_unidades: t.unidades,
      }),
    onSuccess: (_d, v) => {
      inv(v.id);
      avisarExito('Orden terminada. Falta la revisión y la liberación de la DT.');
    },
    onError: avisarError,
  });
}

export function useLiberarOrden() {
  const inv = useInvalidarOrden();
  return useMutation({
    mutationFn: (l: { id: string; aprobado: boolean; motivo: string | null }) =>
      rpcGmp('liberar_orden', { p_id: l.id, p_aprobado: l.aprobado, p_motivo: l.motivo }),
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
    mutationFn: (a: { id: string; motivo: string }) =>
      rpcGmp('anular_orden', { p_id: a.id, p_motivo: a.motivo }),
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
    queryFn: () =>
      rpcGmp<{ etapa: EtapaOrden; falta: string }[]>('faltantes_liberacion', {
        p_id: id,
      }),
  });
}

/** Renglones de pesada teóricos: gmp.calcular_lote con la masa de la orden. */
export function usePesadaTeorica(
  formulaId: string | undefined,
  masaKg: number | undefined,
) {
  return useQuery({
    queryKey: ['pesada-teorica', formulaId, masaKg],
    enabled: Boolean(formulaId) && Boolean(masaKg),
    queryFn: () =>
      rpcGmp<
        {
          orden: number;
          componente: string;
          codigo_interno: string | null;
          masa_kg: number;
        }[]
      >('calcular_lote', { p_formula_id: formulaId, p_masa_kg: masaKg }),
  });
}

export function useOrdenesDePedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['ordenes-de-pedido', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<{ orden_id: string }[]>(
        'pedido_ordenes',
      )
        .select('orden_id')
        .eq('pedido_id', pedidoId!);
      if (error) return [];
      return (data ?? []).map((r) => r.orden_id);
    },
  });
}

/** Una fila de comercial.v_trazabilidad_orden (§8.4). */
export interface FilaTrazabilidad {
  orden_id: string;
  sentido: 'INSUMO' | 'DESPACHO';
  momento: string;
  codigo_interno: string | null;
  articulo: string;
  cantidad: number;
  unidad: string | null;
  lote_interno: string | null;
  lote_proveedor: string | null;
  recepcion: string | null;
  contraparte: string | null;
  pedido: string;
}

export function useTrazabilidadOrden(ordenId: string | undefined) {
  return useQuery({
    queryKey: ['orden', ordenId, 'trazabilidad'],
    enabled: Boolean(ordenId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<FilaTrazabilidad[]>(
        'v_trazabilidad_orden',
      )
        .select('*')
        .eq('orden_id', ordenId!)
        .order('momento', { ascending: true });
      if (error) return [];
      return data ?? [];
    },
  });
}
