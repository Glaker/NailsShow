/**
 * Envase etiquetado y tareas pendientes de carga (20261021120000,
 * D-etiquetado-1).
 *
 * Puente sin tipos hasta regenerar database.types.ts con la migración
 * aplicada: los tipos de acá son el espejo de las vistas, no se inventan.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { avisarError, avisarExito, invalidarStock } from './consultas';

const comercialST = () => (supabase as unknown as SupabaseClient).schema('comercial');
const gmpST = () => (supabase as unknown as SupabaseClient).schema('gmp');

export interface FaltaEtiquetar {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  pendientes: number;
  en_stock: number;
  faltan: number;
  etiquetados_hoy: number;
  definido: boolean;
}

export interface TareaCarga {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  sin_formula: boolean;
  envase_id: string | null;
  etiqueta_id: string | null;
  extras: number;
  tiene_formula: boolean;
  pendientes: number;
  /** «No la sé»: la carga Dirección Técnica (20261021150000). */
  formula_consultada: boolean;
  solo_reventa: boolean;
}

export type RolMaterial = 'ENVASE' | 'ETIQUETA' | 'EXTRA';

export function useFaltanEtiquetar() {
  return useQuery({
    queryKey: ['etiquetado', 'faltan'],
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_faltan_etiquetar')
        .select('*')
        .order('faltan', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as FaltaEtiquetar[];
    },
  });
}

export function useRegistrarEtiquetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { productoId: string; cantidad: number }) => {
      const { error } = await comercialST().rpc('registrar_etiquetado', {
        p_producto_id: e.productoId,
        p_cantidad: e.cantidad,
      });
      if (error) throw error;
    },
    onSuccess: (_, e) => {
      void qc.invalidateQueries({ queryKey: ['etiquetado'] });
      invalidarStock(qc);
      avisarExito(`${e.cantidad} etiquetados: se descontaron envases y etiquetas.`);
    },
    onError: avisarError,
  });
}

/** Etiquetados de hoy de un producto que se pueden anular (ningún pedido los usó). */
export function useEtiquetadosAnulables(productoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['etiquetado', 'anulables', productoId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_etiquetados_saldo')
        .select('etiquetado_id, cantidad, saldo, registrado_en')
        .eq('producto_id', productoId)
        .eq('anulado', false)
        .order('registrado_en', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (
        (data ?? []) as {
          etiquetado_id: string;
          cantidad: number;
          saldo: number;
          registrado_en: string;
        }[]
      ).filter((e) => Number(e.saldo) === Number(e.cantidad));
    },
  });
}

/** Anula un etiquetado mal cargado: devuelve envase y etiqueta (RN-54). */
export function useAnularEtiquetado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { etiquetadoId: string; motivo: string }) => {
      const { error } = await comercialST().rpc('anular_etiquetado', {
        p_etiquetado_id: a.etiquetadoId,
        p_motivo: a.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['etiquetado'] });
      invalidarStock(qc);
      avisarExito('Etiquetado anulado: volvieron el envase y la etiqueta.');
    },
    onError: avisarError,
  });
}

export function useTareasCarga() {
  return useQuery({
    queryKey: ['etiquetado', 'tareas'],
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_tareas_carga')
        .select('*')
        .order('pendientes', { ascending: false })
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as TareaCarga[];
    },
  });
}

function invalidarCarga(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['etiquetado', 'materiales', 'productos', 'formulas', 'pendientes-dt'])
    void qc.invalidateQueries({ queryKey: [k] });
}

/**
 * Agrega un material a un producto: envase, etiqueta o extra, con su
 * categoría («Etiqueta trasera», «Guarnición»). Todos se suman: un envase
 * puede ser dos insumos (20261022200200, D-ajustes-3). Si el insumo ya estaba
 * vigente, se le cambia el rol.
 */
export function useAsignarMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      productoId: string;
      insumoId: string;
      rol: RolMaterial;
      categoria?: string | null;
    }) => {
      const tabla = () => gmpST().from('materiales_acondicionamiento');
      const categoria = m.categoria?.trim() || null;
      /* Solo la fila vigente: una quitada no se reactiva
         (gmp.fn_material_sin_reactivar), se agrega una nueva. */
      const { data: existe, error: e1 } = await tabla()
        .select('producto_id')
        .eq('producto_id', m.productoId)
        .eq('insumo_id', m.insumoId)
        .eq('activo', true)
        .maybeSingle();
      if (e1) throw e1;
      const { error } = existe
        ? await tabla()
            .update({ rol: m.rol, categoria })
            .eq('producto_id', m.productoId)
            .eq('insumo_id', m.insumoId)
            .eq('activo', true)
        : await tabla().insert({
            producto_id: m.productoId,
            insumo_id: m.insumoId,
            cantidad_por_unidad: 1,
            rol: m.rol,
            categoria,
          });
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}

export function useQuitarMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { productoId: string; insumoId: string }) => {
      const { error } = await gmpST()
        .from('materiales_acondicionamiento')
        .update({ activo: false })
        .eq('producto_id', m.productoId)
        .eq('insumo_id', m.insumoId)
        .eq('activo', true);
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}

export interface MaterialProducto {
  insumo_id: string;
  rol: RolMaterial | null;
  categoria: string | null;
  insumo: { nombre: string; codigo_interno: string; unidad_medida: string | null } | null;
}

/** Todo lo que lleva un producto hoy: envase, etiquetas y extras, con su categoría. */
export function useMaterialesProducto(productoId: string, habilitado = true) {
  return useQuery({
    queryKey: ['materiales', 'producto', productoId],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('materiales_acondicionamiento')
        .select(
          'insumo_id, rol, categoria, insumo:insumos_catalogo(nombre, codigo_interno, unidad_medida)',
        )
        .eq('producto_id', productoId)
        .eq('activo', true);
      if (error) throw error;
      const orden = { ENVASE: 0, ETIQUETA: 1, EXTRA: 2 } as Record<string, number>;
      return ((data ?? []) as unknown as MaterialProducto[]).sort(
        (a, b) => (orden[a.rol ?? ''] ?? 3) - (orden[b.rol ?? ''] ?? 3),
      );
    },
  });
}

/** «No la sé»: la fórmula pasa a Fórmulas › Pendientes de Dirección Técnica. */
export function useConsultarFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productoId: string) => {
      const { error } = await gmpST().rpc('consultar_formula', {
        p_producto_id: productoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarCarga(qc);
      avisarExito('Listo: Dirección Técnica la ve en Fórmulas › Pendientes.');
    },
    onError: avisarError,
  });
}

/** Producto de reventa: no lleva envase, etiqueta ni fórmula. */
export function useMarcarReventa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { productoId: string; reventa: boolean }) => {
      const { error } = await gmpST()
        .from('productos')
        .update({ solo_reventa: p.reventa })
        .eq('id', p.productoId);
      if (error) throw error;
    },
    onSuccess: (_, p) => {
      invalidarCarga(qc);
      avisarExito(
        p.reventa ? 'Marcado como reventa: sale de las tareas.' : 'Ya no es reventa.',
      );
    },
    onError: avisarError,
  });
}

export interface FormulaConsultada {
  producto_id: string;
  codigo_interno: string;
  nombre: string;
  formula_consultada_en: string;
  consultada_por: string | null;
}

/** Fórmulas que Gerencia de Producción derivó a Dirección Técnica. */
export function useFormulasConsultadas() {
  return useQuery({
    queryKey: ['formulas', 'consultadas'],
    queryFn: async () => {
      const { data, error } = await gmpST()
        .from('v_formulas_consultadas')
        .select('*')
        .order('formula_consultada_en');
      if (error) throw error;
      return (data ?? []) as FormulaConsultada[];
    },
  });
}

/** Insumos de la última fórmula del producto, para estimarles el costo. */
export function useInsumosDeFormula(productoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['formulas', 'insumos-de-producto', productoId],
    enabled: habilitado,
    queryFn: async () => {
      const { data: f, error: e1 } = await gmpST()
        .from('formulas_fabricacion')
        .select('id')
        .eq('producto_id', productoId)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!f) return [];
      const { data, error } = await gmpST()
        .from('formula_componentes')
        .select(
          'insumo_id, insumo:insumos_catalogo(nombre, codigo_interno, unidad_medida)',
        )
        .eq('formula_id', f.id)
        .not('insumo_id', 'is', null);
      if (error) throw error;
      return (data ?? []) as unknown as {
        insumo_id: string;
        insumo: {
          nombre: string;
          codigo_interno: string;
          unidad_medida: string | null;
        } | null;
      }[];
    },
  });
}

/** «No corresponde»: el producto no lleva fórmula. */
export function useMarcarSinFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { productoId: string; sinFormula: boolean }) => {
      const { error } = await gmpST()
        .from('productos')
        .update({ sin_formula: p.sinFormula })
        .eq('id', p.productoId);
      if (error) throw error;
    },
    onSuccess: () => invalidarCarga(qc),
    onError: avisarError,
  });
}

/** Tiempo de envasado del producto (D-tiempo-envasado-1). */
export function useGuardarTiempoEnvasado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      productoId: string;
      minutosUnidad: number | null;
      /** D-ajustes-2: el etiquetado, aparte del envasado. */
      minutosEtiquetado: number | null;
      margenPct: number;
      personas: number;
    }) => {
      const { error } = await gmpST()
        .from('productos')
        .update({
          minutos_envasado_unidad: p.minutosUnidad,
          minutos_etiquetado_unidad: p.minutosEtiquetado,
          margen_envasado_pct: p.margenPct,
          personas_envasado: p.personas,
        })
        .eq('id', p.productoId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['productos'] });
      avisarExito('Tiempo de envasado guardado.');
    },
    onError: avisarError,
  });
}

/** Insumo ya etiquetado para un producto: el último conteo vigente (D-insumos-etiquetados-1). */
export interface InsumoEtiquetado {
  id: string;
  insumo_id: string;
  insumo_codigo: string;
  insumo_nombre: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  cantidad: number;
  observacion: string | null;
  registrado_en: string;
  registrado_por_nombre: string | null;
}

export function useInsumosEtiquetados() {
  return useQuery({
    queryKey: ['etiquetado', 'insumos'],
    queryFn: async () => {
      const { data, error } = await comercialST()
        .from('v_insumos_etiquetados')
        .select('*')
        .order('insumo_codigo')
        .order('producto_nombre');
      if (error) throw error;
      return (data ?? []) as InsumoEtiquetado[];
    },
  });
}

/**
 * Corregir es contar de nuevo: cada renglón es un conteo y el vigente es el
 * último (la tabla no admite UPDATE). Pasar a otro producto deja el viejo en 0
 * y el nuevo en la cantidad, en un solo INSERT.
 */
export function useContarInsumosEtiquetados() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      conteos: {
        insumo_id: string;
        producto_id: string;
        cantidad: number;
        observacion: string | null;
      }[],
    ) => {
      const { error } = await comercialST().from('insumos_etiquetados').insert(conteos);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['etiquetado', 'insumos'] });
      avisarExito('Etiquetados actualizados.');
    },
    onError: avisarError,
  });
}
