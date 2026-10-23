/**
 * Tiempo de envasado (D-tiempo-envasado-1): cuánto lleva una tanda y cuántos
 * días de producción recomendar en el Gantt.
 */

/** Jornada de 8 a 15 con 30 minutos de descanso (pedido del 2026-10-21). */
export const MINUTOS_JORNADA = 7 * 60 - 30;

export interface TiempoEnvasado {
  minutosUnidad: number;
  margenPct: number;
  personas: number;
}

/** Columnas de gmp.productos (20261022160000, 20261022200100), hasta regenerar los tipos. */
export interface ProductoConTiempo {
  minutos_envasado_unidad?: number | string | null;
  minutos_etiquetado_unidad?: number | string | null;
  margen_envasado_pct?: number | string | null;
  personas_envasado?: number | null;
}

/**
 * El tiempo cargado en el producto, o null si no tiene. Por unidad es
 * envasado + etiquetado (D-ajustes-2).
 */
export function tiempoDe(p: ProductoConTiempo | undefined): TiempoEnvasado | null {
  const min =
    Number(p?.minutos_envasado_unidad ?? 0) + Number(p?.minutos_etiquetado_unidad ?? 0);
  if (!(min > 0)) return null;
  return {
    minutosUnidad: min,
    margenPct: Number(p?.margen_envasado_pct ?? 10),
    personas: Math.max(1, p?.personas_envasado ?? 1),
  };
}

/** Minutos de trabajo de la tanda, margen incluido, sumando a todas las personas. */
export const minutosTrabajo = (cantidad: number, t: TiempoEnvasado) =>
  cantidad * t.minutosUnidad * (1 + t.margenPct / 100);

/** Minutos de reloj: el trabajo repartido entre las personas. */
export const minutosReloj = (cantidad: number, t: TiempoEnvasado) =>
  minutosTrabajo(cantidad, t) / t.personas;

/** Días de producción para envasar todo, al menos uno. */
export const diasRecomendados = (minutosDeReloj: number) =>
  Math.max(1, Math.ceil(minutosDeReloj / MINUTOS_JORNADA - 1e-9));

/** Minutos → «MM:SS» (1,5 → «1:30»). Vacío si no hay tiempo. */
export function aMmss(min: number | string | null | undefined): string {
  const seg = Math.round(Number(min ?? 0) * 60);
  if (!(seg > 0)) return '';
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

/**
 * «MM:SS» → minutos. «45» solo son segundos; «1:30», un minuto y medio.
 * Vacío = null; algo que no se entiende = NaN.
 */
export function deMmss(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const m = /^(?:(\d+):)?(\d{1,2})$/.exec(t);
  if (!m || Number(m[2]) > 59) return NaN;
  return Number(m[1] ?? 0) + Number(m[2]) / 60;
}

/** «18 h 20 min», «45 min». */
export function horasMinutos(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Días recomendados para una producción de varios productos: se suman los
 * minutos de reloj de cada uno. `faltan` cuenta los que no tienen tiempo.
 */
export function recomendacion(
  renglones: { cantidad: number; tiempo: TiempoEnvasado | null }[],
): { dias: number; minutos: number; faltan: number } | null {
  const con = renglones.filter((r) => r.tiempo);
  if (con.length === 0) return null;
  const minutos = con.reduce((s, r) => s + minutosReloj(r.cantidad, r.tiempo!), 0);
  return {
    dias: diasRecomendados(minutos),
    minutos,
    faltan: renglones.length - con.length,
  };
}
