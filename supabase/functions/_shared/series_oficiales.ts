/**
 * Series macro desde fuentes oficiales (pedido del 2026-10-15): el tipo de
 * cambio A3500 del BCRA y el IPC del INDEC, para que Finanzas no los cargue a
 * mano en comercial.series_macro.
 *
 * Lógica pura, sin red ni Deno: la Edge Function `series-oficiales` baja los
 * archivos y le pasa las filas. Se prueba en series_oficiales.test.ts.
 */

export type SerieMacro = 'IPC' | 'TC_A3500_PROMEDIO' | 'TC_A3500_CIERRE';

export interface PuntoSerie {
  serie: SerieMacro;
  /** Primer día del mes, 'YYYY-MM-01'. */
  mes: string;
  valor: number;
  fuente: string;
  es_provisorio: boolean;
}

export interface FilaExistente {
  id: string;
  serie: SerieMacro;
  mes: string;
  valor: number;
  es_provisorio: boolean;
}

/** Planilla oficial de la Comunicación «A» 3500 (diaria, y promedio mensual en la segunda hoja). */
export const URL_A3500 =
  'https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/com3500.xls';
/** IPC Nacional, nivel general, base dic-2016, del INDEC, por la API de series del Estado. */
export const SERIE_IPC = '148.3_INIVELNAL_DICI_M_26';
export const URL_IPC = `https://apis.datos.gob.ar/series/api/series/?ids=${SERIE_IPC}&start_date=2017-01-01&limit=1000&format=json`;

export const FUENTE_A3500 = 'BCRA · Comunicación A 3500 (com3500.xls)';
export const FUENTE_IPC = `INDEC · IPC nacional nivel general base dic-2016 (datos.gob.ar ${SERIE_IPC})`;

/** Desde cuándo se cargan: el IPC base dic-2016 arranca en 2017. */
export const DESDE = '2017-01-01';

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const mesDe = (fecha: string) => `${fecha.slice(0, 7)}-01`;

/**
 * Número de serie de Excel → 'YYYY-MM-DD'. Se convierte a mano y en UTC: la
 * conversión de la librería usa el huso del servidor y corre el día.
 */
export function fechaExcel(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Del com3500.xls a puntos mensuales.
 *
 * - `diarias`: filas de la primera hoja, [_, fecha (serie Excel), valor, ...].
 * - `mensuales`: filas de la segunda hoja, [mes (serie Excel), promedio].
 *
 * Cierre = último día publicado del mes. Promedio = el que publica el BCRA; si
 * todavía no lo publicó (mes en curso o recién cerrado), la media de los días
 * publicados. Todo mes que no terminó, o cuyo promedio no es el oficial, va
 * como provisorio y se reemplaza en la próxima corrida.
 */
export function puntosA3500(
  diarias: unknown[][],
  mensuales: unknown[][],
  hoy: string,
): PuntoSerie[] {
  const mesActual = mesDe(hoy);
  const porMes = new Map<
    string,
    { ultimoDia: string; ultimo: number; suma: number; n: number }
  >();
  for (const f of diarias) {
    const [, serial, valor] = f;
    if (typeof serial !== 'number' || typeof valor !== 'number' || !(valor > 0)) continue;
    const dia = fechaExcel(serial);
    if (dia < DESDE) continue;
    const m = mesDe(dia);
    const a = porMes.get(m) ?? { ultimoDia: '', ultimo: 0, suma: 0, n: 0 };
    if (dia > a.ultimoDia) Object.assign(a, { ultimoDia: dia, ultimo: valor });
    a.suma += valor;
    a.n += 1;
    porMes.set(m, a);
  }

  const oficial = new Map<string, number>();
  for (const [serial, valor] of mensuales) {
    if (typeof serial === 'number' && typeof valor === 'number' && valor > 0)
      oficial.set(mesDe(fechaExcel(serial)), valor);
  }

  const puntos: PuntoSerie[] = [];
  for (const [mes, a] of [...porMes].sort(([x], [y]) => x.localeCompare(y))) {
    const abierto = mes >= mesActual;
    puntos.push({
      serie: 'TC_A3500_CIERRE',
      mes,
      valor: r4(a.ultimo),
      fuente: FUENTE_A3500,
      es_provisorio: abierto,
    });
    const prom = oficial.get(mes);
    puntos.push({
      serie: 'TC_A3500_PROMEDIO',
      mes,
      valor: r4(prom ?? a.suma / a.n),
      fuente: FUENTE_A3500,
      es_provisorio: abierto || prom === undefined,
    });
  }
  return puntos;
}

/** Respuesta de apis.datos.gob.ar: { data: [['YYYY-MM-01', índice], ...] }. */
export function puntosIpc(respuesta: unknown): PuntoSerie[] {
  const data = (respuesta as { data?: unknown })?.data;
  if (!Array.isArray(data))
    throw new Error('La respuesta del IPC no tiene el formato esperado.');
  return data.flatMap((f) => {
    const [fecha, valor] = Array.isArray(f) ? (f as unknown[]) : [];
    if (typeof fecha !== 'string' || typeof valor !== 'number' || !(valor > 0)) return [];
    if (fecha < DESDE) return [];
    return [
      {
        serie: 'IPC' as const,
        mes: mesDe(fecha),
        valor: r4(valor),
        fuente: FUENTE_IPC,
        es_provisorio: false,
      },
    ];
  });
}

/**
 * Qué escribir. Un mes que falta se inserta; un provisorio se actualiza si
 * cambió el valor o pasó a definitivo. Un definitivo no se toca nunca: puede
 * ser un valor que Finanzas cargó o corrigió a mano.
 */
export function planDeCarga(existentes: FilaExistente[], nuevos: PuntoSerie[]) {
  const clave = (s: string, m: string) => `${s}|${m.slice(0, 10)}`;
  const hay = new Map(existentes.map((e) => [clave(e.serie, e.mes), e]));
  const insertar: PuntoSerie[] = [];
  const actualizar: (PuntoSerie & { id: string })[] = [];
  for (const p of nuevos) {
    const e = hay.get(clave(p.serie, p.mes));
    if (!e) insertar.push(p);
    else if (e.es_provisorio && (Number(e.valor) !== p.valor || !p.es_provisorio))
      actualizar.push({ ...p, id: e.id });
  }
  return { insertar, actualizar };
}
