import { useMemo } from 'react';
import { z } from 'zod';
import { numero } from '@/lib/formato';
import {
  useCostosReferencia,
  type Moneda,
  type CostoReferencia,
} from '@/lib/consultasCostos';
import type { ValorCosto } from './CamposCosto';

export const pesos = (v: number) => `$ ${numero(v, 2)}`;
/** Precios unitarios: un gramo cuesta centavos, con dos decimales se pierde el dato. */
export const pesosUnitario = (v: number) => `$ ${numero(v, 4)}`;

/** Origen de un precio de referencia o de un producto. */
export const ORIGEN_PRECIO: Record<string, { label: string; color: string }> = {
  MANUAL: { label: 'Finanzas', color: 'blue' },
  ULTIMO_LOTE: { label: 'Último lote', color: 'green' },
  APERTURA: { label: 'Apertura', color: 'gray' },
  COSTO_HORA: { label: 'Costo hora', color: 'violet' },
};

/** Mapa insumo_id → fila de referencia, para cruzar con lotes y avisos. */
export function useReferenciaPorInsumo(): Map<string, CostoReferencia> {
  const referencia = useCostosReferencia();
  return useMemo(
    () => new Map((referencia.data ?? []).map((r) => [r.insumo_id, r])),
    [referencia.data],
  );
}

/** Campos del costo tal como los pide la base (CHECK de costos_lote). */
export const formaCosto = {
  tipo_comprobante: z.enum([
    'FACTURA_A',
    'FACTURA_B',
    'FACTURA_C',
    'NO_DISCRIMINADO',
    'SIN_COMPROBANTE',
  ]),
  importe: z
    .number({ error: 'Falta el importe' })
    .min(0, 'El importe no puede ser negativo'),
  incluye_iva: z.boolean(),
  alicuota_iva: z.number(),
  moneda: z.enum(['ARS', 'USD']),
  tipo_cambio: z.number().nullable(),
  cantidad: z.number().nullable(),
  unidad: z.string().min(1, 'Falta la unidad'),
};

/** Reglas que la forma no puede expresar: cantidad obligatoria y tipo de cambio en dólares. */
export function reglasCosto(
  v: { cantidad: number | null; moneda: Moneda; tipo_cambio: number | null },
  ctx: z.RefinementCtx,
  conCantidad: boolean,
) {
  if (conCantidad && !((v.cantidad ?? 0) > 0))
    ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'Falta la cantidad' });
  if (v.moneda === 'USD' && !((v.tipo_cambio ?? 0) > 0))
    ctx.addIssue({
      code: 'custom',
      path: ['tipo_cambio'],
      message: 'Falta el tipo de cambio',
    });
}

/** Del formulario al payload del hook: en pesos el tipo de cambio es 1. */
export function camposParaGuardar(v: ValorCosto) {
  return {
    tipo_comprobante: v.tipo_comprobante,
    importe: v.importe ?? 0,
    incluye_iva: v.incluye_iva,
    alicuota_iva: v.alicuota_iva,
    moneda: v.moneda,
    tipo_cambio: v.moneda === 'USD' ? (v.tipo_cambio ?? 0) : 1,
    cantidad: v.cantidad ?? 0,
    unidad: v.unidad,
  };
}

/** Input numérico de Mantine: vacío es null, no ''. */
export const numOrNull = (v: number | string) => (v === '' ? null : Number(v));
