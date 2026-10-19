// Conversión de importes entre pesos corrientes, dólares y pesos constantes.
// Única para todo el módulo de costos: ningún gráfico convierte por su cuenta.
//
//   Dólares:          USD_t = ARS_t / TC_t
//   Pesos constantes: ARS_constantes_t = ARS_t × IPC_base / IPC_t
//
// Los flujos del mes (facturación, gastos, costos) usan el tipo de cambio
// PROMEDIO del mes; los saldos (stock valorizado, capital inmovilizado), el de
// CIERRE. Mezclarlos da series que no cierran entre sí.
//
// El IPC se publica con unas dos semanas de demora: un mes posterior al último
// dato se ESTIMA con la última variación mensual conocida y sale marcado como
// provisorio. El tipo de cambio no se estima: sin dato, no hay conversión.

export type VistaMoneda = 'CORRIENTE' | 'USD' | 'CONSTANTE';
export type Naturaleza = 'FLUJO' | 'SALDO';

/** Un valor mensual de una serie. `mes` es 'AAAA-MM'. */
export interface PuntoSerie {
  mes: string;
  valor: number;
  provisorio: boolean;
}

export interface SeriesMacro {
  ipc: PuntoSerie[];
  tcPromedio: PuntoSerie[];
  tcCierre: PuntoSerie[];
}

export interface Convertido {
  valor: number | null;
  provisorio: boolean;
}

const mesesEntre = (desde: string, hasta: string) => {
  const [a1 = 0, m1 = 0] = desde.split('-').map(Number);
  const [a2 = 0, m2 = 0] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};

/** Valor de una serie en un mes, sin estimar. */
function exacto(serie: PuntoSerie[], mes: string): PuntoSerie | undefined {
  return serie.find((p) => p.mes === mes);
}

/**
 * IPC de un mes. Si es posterior al último dato, se extrapola con la última
 * variación mensual conocida, compuesta por cada mes faltante.
 */
export function ipcDelMes(ipc: PuntoSerie[], mes: string): Convertido {
  const dato = exacto(ipc, mes);
  if (dato) return { valor: dato.valor, provisorio: dato.provisorio };
  const orden = [...ipc].sort((a, b) => a.mes.localeCompare(b.mes));
  const ultimo = orden.at(-1);
  if (!ultimo || mes < ultimo.mes) return { valor: null, provisorio: false };
  const anterior = orden.at(-2);
  const variacion = anterior ? ultimo.valor / anterior.valor - 1 : 0;
  return {
    valor: ultimo.valor * (1 + variacion) ** mesesEntre(ultimo.mes, mes),
    provisorio: true,
  };
}

/** Mes base por defecto de los pesos constantes: el último con IPC definitivo. */
export function mesBasePorDefecto(ipc: PuntoSerie[]): string | null {
  const definitivos = ipc.filter((p) => !p.provisorio).map((p) => p.mes);
  return definitivos.length ? definitivos.sort().at(-1)! : null;
}

export function convertir(
  importe: number,
  mes: string,
  vista: VistaMoneda,
  naturaleza: Naturaleza,
  series: SeriesMacro,
  mesBase: string | null = mesBasePorDefecto(series.ipc),
): Convertido {
  if (vista === 'CORRIENTE') return { valor: importe, provisorio: false };
  if (vista === 'USD') {
    const tc = exacto(naturaleza === 'FLUJO' ? series.tcPromedio : series.tcCierre, mes);
    if (!tc) return { valor: null, provisorio: false };
    return { valor: importe / tc.valor, provisorio: tc.provisorio };
  }
  if (!mesBase) return { valor: null, provisorio: false };
  const base = ipcDelMes(series.ipc, mesBase);
  const delMes = ipcDelMes(series.ipc, mes);
  if (base.valor === null || delMes.valor === null)
    return { valor: null, provisorio: false };
  return {
    valor: (importe * base.valor) / delMes.valor,
    provisorio: base.provisorio || delMes.provisorio,
  };
}

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Leyenda para el título de cada gráfico: nadie lee un número sin saber en qué moneda está. */
export function leyendaVista(
  vista: VistaMoneda,
  mesBase: string | null,
  serieTc: string,
): string {
  if (vista === 'CORRIENTE') return 'en pesos corrientes';
  if (vista === 'USD') return `en dólares (${serieTc})`;
  if (!mesBase) return 'en pesos constantes (sin IPC cargado)';
  const [a, m] = mesBase.split('-');
  return `en pesos constantes de ${MESES[Number(m) - 1]}-${a}`;
}
