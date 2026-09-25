/**
 * Consultas de facturación electrónica: clientes, facturas y la emisión por la
 * Edge Function `emitir-factura`.
 *
 * Tipado desde los tipos generados (CLAUDE.md §6): estas tablas ya estaban en
 * la base cuando se regeneró `database.types.ts`.
 *
 * El token de Afip SDK nunca pasa por acá: el navegador llama a la función con
 * la sesión del usuario, y la función lo lee del almacén de secretos (RN-66).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { comercial, supabase } from './supabase';
import { avisarError, avisarExito } from './consultas';

export type Cliente = Database['comercial']['Tables']['clientes']['Row'];
export type CondicionIva = Database['comercial']['Enums']['condicion_iva_enum'];
export type TipoDocumento = Database['comercial']['Enums']['tipo_documento_enum'];
export type Factura = Database['comercial']['Tables']['facturas']['Row'];
export type EstadoFactura = Database['comercial']['Enums']['estado_factura_enum'];

/** Quién emite (D-31): el mismo criterio que `preparar_factura()` y la política. */
export const ROLES_FACTURAN = [
  'ADMINISTRACION',
  'GERENCIA',
  'GERENCIA_PRODUCCION',
] as const;
/** Alta y edición de clientes (§3.3): la política de `comercial.clientes`. */
export const ROLES_CLIENTES = [
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
] as const;

export const TEXTO_CONDICION: Record<CondicionIva, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
  NO_ALCANZADO: 'No alcanzado',
};

export const TEXTO_DOCUMENTO: Record<TipoDocumento, string> = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  SIN_IDENTIFICAR: 'Sin identificar',
};

/**
 * RN-57, espejo de `comercial.clase_factura()`: A a Responsable Inscripto y a
 * Monotributo (ARCA rechaza B a monotributo, 10243; D-30), B al resto. Solo
 * para mostrarlo antes de emitir: decide la base.
 */
/** Alícuotas de IVA que acepta la base (comercial.alicuota_iva_arca). */
export const ALICUOTAS = [
  { value: '21', label: '21 %' },
  { value: '10.5', label: '10,5 %' },
  { value: '27', label: '27 %' },
  { value: '0', label: '0 %' },
];

export function claseFactura(c: CondicionIva): 'A' | 'B' {
  return c === 'RESPONSABLE_INSCRIPTO' || c === 'MONOTRIBUTO' ? 'A' : 'B';
}

/** Espejo de `comercial.cuit_valido()`: 11 dígitos, dígito verificador módulo 11. */
export function cuitValido(p: string): boolean {
  if (!/^[0-9]{11}$/.test(p)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, w, i) => a + Number(p[i]) * w, 0);
  const dv = 11 - (suma % 11);
  return (dv === 11 ? 0 : dv === 10 ? 9 : dv) === Number(p[10]);
}

export function formatearCuit(p: string): string {
  return /^[0-9]{11}$/.test(p) ? `${p.slice(0, 2)}-${p.slice(2, 10)}-${p.slice(10)}` : p;
}

export function numeroComprobante(f: Pick<Factura, 'punto_venta' | 'numero'>): string {
  return `${String(f.punto_venta).padStart(4, '0')}-${f.numero === null ? '________' : String(f.numero).padStart(8, '0')}`;
}

/* ------------------------------------------------------------------------- *
 * Clientes
 * ------------------------------------------------------------------------- */

export function useClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('clientes')
        .select('*')
        .order('razon_social');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface DatosCliente {
  razon_social: string;
  condicion_iva: CondicionIva;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  domicilio: string | null;
  email: string | null;
  activo: boolean;
}

export function useGuardarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, datos }: { id: string | null; datos: DatosCliente }) => {
      if (id) {
        const { data, error } = await comercial()
          .from('clientes')
          .update(datos)
          .eq('id', id)
          .select();
        if (error) throw error;
        // Un UPDATE que RLS filtra no falla: afecta cero filas.
        if (!data || data.length === 0)
          throw new Error('Tu rol no puede editar clientes.');
        return data[0]!;
      }
      const { data, error } = await comercial()
        .from('clientes')
        .insert(datos)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['clientes'] });
      avisarExito(v.id ? 'Cliente actualizado.' : 'Cliente dado de alta.');
    },
    onError: avisarError,
  });
}

/* ------------------------------------------------------------------------- *
 * Facturas
 * ------------------------------------------------------------------------- */

export type FacturaConDatos = Factura & {
  pedido: { numero: string } | null;
  cliente_ref: { razon_social: string } | null;
};

export function useFacturas() {
  return useQuery({
    queryKey: ['facturas'],
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('facturas')
        .select('*, pedido:pedidos(numero), cliente_ref:clientes(razon_social)')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFacturasDePedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ['facturas', 'pedido', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('facturas')
        .select('*')
        .eq('pedido_id', pedidoId!)
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ResultadoEmision {
  factura_id: string;
  estado: EstadoFactura;
  tipo?: 'A' | 'B';
  punto_venta?: number;
  numero?: number | null;
  cae?: string | null;
  cae_vencimiento?: string | null;
  importe_total?: number;
  motivo?: string | null;
  observaciones?: string | null;
}

/**
 * Emite la factura del pedido por la Edge Function. La función devuelve un
 * resultado también cuando ARCA rechaza (estado RECHAZADA con el motivo): eso
 * no es un error de la llamada, es una respuesta, y se muestra como tal.
 */
export function useEmitirFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedidoId: string): Promise<ResultadoEmision> => {
      // `invoke` tipa el error como any: se lo toma como unknown y se lo angosta.
      const respuestaInvoke = await supabase.functions.invoke<ResultadoEmision>(
        'emitir-factura',
        { body: { pedido_id: pedidoId } },
      );
      const data: ResultadoEmision | null = respuestaInvoke.data;
      const error: unknown = respuestaInvoke.error;
      if (error) {
        // Error HTTP de la función: el cuerpo trae el motivo escrito.
        if (error instanceof FunctionsHttpError) {
          const respuesta = error.context as Response;
          const cuerpo = (await respuesta.json().catch(() => null)) as
            (Partial<ResultadoEmision> & { error?: string }) | null;
          if (cuerpo?.estado) return cuerpo as ResultadoEmision;
          throw new Error(cuerpo?.error ?? error.message);
        }
        throw error instanceof Error
          ? error
          : new Error('No se pudo llamar a la función de facturación.');
      }
      if (!data) throw new Error('La función no devolvió resultado.');
      return data;
    },
    onSuccess: (r, pedidoId) => {
      void qc.invalidateQueries({ queryKey: ['facturas'] });
      void qc.invalidateQueries({ queryKey: ['facturas', 'pedido', pedidoId] });
      if (r.estado === 'AUTORIZADA')
        avisarExito(`Factura ${r.tipo} autorizada. CAE ${r.cae}.`);
    },
    onError: avisarError,
  });
}
