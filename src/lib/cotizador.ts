/**
 * Cálculo del cotizador en la pantalla, en vivo mientras se edita.
 *
 * Es espejo de comercial.costear_cotizacion y comercial.precio_cotizacion
 * (20261009160000): misma conversión a unidad base, misma merma
 * (cantidad / (1 − merma)), mismo precio desde el margen. Lo que vale es lo
 * que calcula el servidor al emitir; esto es para ver el número al instante.
 * Los casos de cotizador.test.ts son los mismos de probar_cotizador.mjs.
 */

import { convertirCantidad } from './consultasCostos';

export type TipoLinea = 'CATALOGO' | 'NUEVO' | 'LIBRE';
export type ModoMargen = 'SOBRE_PRECIO' | 'SOBRE_COSTO';

export interface LineaCotizacion {
  tipo: TipoLinea;
  nombre: string;
  cantidad: number;
  unidad: string;
  merma: number;
  /** CATALOGO: costo de referencia por unidad del catálogo y esa unidad. */
  costoCatalogo?: number | null;
  unidadCatalogo?: string | null;
  /** NUEVO y LIBRE: precio cargado a mano. */
  precio?: number | null;
  cantidadPresentacion?: number | null;
  unidadPresentacion?: string | null;
  incluyeIva?: boolean | null;
  alicuotaIva?: number | null;
  densidad?: number | null;
}

export interface CostoLinea {
  precioBase: number | null;
  unidadBase: string;
  subtotal: number | null;
  falta: string | null;
}

export const unidadBase = (u: string | null | undefined): string => {
  const x = (u ?? '').trim().toLowerCase();
  return x === 'kg' || x === 'g' ? 'g' : x === 'l' || x === 'ml' ? 'ml' : 'unidad';
};

const neto = (
  precio: number,
  incluyeIva: boolean | null | undefined,
  alicuota: number | null | undefined,
) => (incluyeIva ? precio / (1 + (alicuota ?? 0) / 100) : precio);

const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function costearLinea(l: LineaCotizacion): CostoLinea {
  let pb: number | null;
  let ub = 'unidad';
  if (l.tipo === 'CATALOGO') {
    ub = unidadBase(l.unidadCatalogo);
    const f = l.unidadCatalogo ? convertirCantidad(1, l.unidadCatalogo, ub) : null;
    pb = l.costoCatalogo != null && f ? l.costoCatalogo / f : null;
  } else if (l.tipo === 'NUEVO') {
    ub = unidadBase(l.unidadPresentacion);
    const f =
      l.cantidadPresentacion && l.unidadPresentacion
        ? convertirCantidad(l.cantidadPresentacion, l.unidadPresentacion, ub)
        : null;
    pb = l.precio != null && f ? neto(l.precio, l.incluyeIva, l.alicuotaIva) / f : null;
  } else {
    pb = l.precio != null ? neto(l.precio, l.incluyeIva, l.alicuotaIva) : null;
  }
  const cant =
    l.tipo === 'LIBRE'
      ? l.cantidad
      : convertirCantidad(l.cantidad, l.unidad, ub, l.densidad ?? null);
  const falta =
    l.tipo === 'CATALOGO' && l.costoCatalogo == null
      ? 'Insumo sin costo de referencia'
      : pb === null
        ? 'Precio o unidad sin convertir'
        : cant === null
          ? `Falta la densidad para pasar ${l.unidad} a ${ub}`
          : null;
  return {
    precioBase: pb === null ? null : r(pb, 6),
    unidadBase: ub,
    subtotal: pb !== null && cant !== null ? r((cant * pb) / (1 - l.merma), 4) : null,
    falta,
  };
}

/**
 * Normaliza un precio por presentación a precio por unidad base:
 * precio_base = precio / (cantidad_presentación × factor a la unidad base).
 * $12.000 por 500 g → $24 el g ($24.000 el kg).
 */
export function precioPorUnidadBase(
  precio: number,
  cantidad: number,
  unidad: string,
): number | null {
  const f = convertirCantidad(cantidad, unidad, unidadBase(unidad));
  return f ? precio / f : null;
}

/** Margen sobre el precio: P = C / (1 − m). Recargo sobre el costo: P = C × (1 + k). */
export function precioDesdeMargen(
  costo: number,
  margen: number,
  modo: ModoMargen,
  redondeo: number,
): number {
  const p = modo === 'SOBRE_PRECIO' ? costo / (1 - margen) : costo * (1 + margen);
  return Math.round(p / redondeo) * redondeo;
}

/**
 * comercial.precio_cotizacion: el neto (para el margen) y el mostrado (lo que
 * lee el cliente). Con «IVA incluido» el redondeo va sobre el mostrado y un
 * precio fijado se escribe con IVA.
 */
export function precioCotizacion(p: {
  costo: number;
  modo: ModoMargen;
  fija: 'MARGEN' | 'PRECIO';
  margen: number | null;
  precio: number | null;
  redondeo: number;
  ivaIncluido: boolean;
  alicuota: number;
}): { neto: number; mostrado: number } | null {
  const k = p.ivaIncluido ? 1 + p.alicuota / 100 : 1;
  let mostrado: number;
  if (p.fija === 'PRECIO') {
    if (!p.precio) return null;
    mostrado = p.precio;
  } else {
    if (p.margen === null || (p.modo === 'SOBRE_PRECIO' && p.margen >= 1)) return null;
    const neto =
      p.modo === 'SOBRE_PRECIO' ? p.costo / (1 - p.margen) : p.costo * (1 + p.margen);
    mostrado = Math.round((neto * k) / p.redondeo) * p.redondeo;
  }
  return { neto: mostrado / k, mostrado: Math.round(mostrado * 100) / 100 };
}

/** Las dos cifras a la vez, para que nadie confunda margen con recargo. */
export function margenes(costo: number, precio: number) {
  return {
    sobrePrecio: precio > 0 ? (precio - costo) / precio : null,
    sobreCosto: costo > 0 ? (precio - costo) / costo : null,
  };
}
