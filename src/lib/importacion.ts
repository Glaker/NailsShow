/**
 * Importación de planillas (Fase 6, D-54): genérica, estricta.
 *
 * La planilla tiene que tener EXACTAMENTE los encabezados de la plantilla, en
 * la primera fila (el orden de las columnas da igual; sobrar o faltar una, no).
 * No se adivina nada: lo que no respeta la plantilla se rechaza con el motivo.
 * Cada renglón sale como «crear», «actualizar» o «error»; recién al confirmar
 * se escribe, en una sola transacción, con la función de la plantilla.
 */

import type { Celda } from './xlsx';
import { convertirCantidad } from './consultasCostos';

export type TipoColumna = 'texto' | 'numero' | 'fecha';

export interface Columna {
  clave: string;
  tipo: TipoColumna;
  requerida: boolean;
  descripcion: string;
  ejemplo: Celda;
  /** Valores admitidos (se comparan sin distinguir mayúsculas). */
  valores?: string[];
}

export interface Plantilla<C = unknown> {
  clave: string;
  titulo: string;
  archivo: string;
  descripcion: string;
  columnas: Columna[];
  /** Reglas que dependen del renglón entero o de datos de la base. */
  validar: (
    fila: Record<string, Celda>,
    contexto: C,
  ) => { accion: 'crear' | 'actualizar'; errores: string[] };
}

export interface RenglonLeido {
  numero: number; // número de fila en la planilla (la 1 es el encabezado)
  datos: Record<string, Celda>;
  accion: 'crear' | 'actualizar' | 'error';
  errores: string[];
}

export type ResultadoLectura =
  { ok: false; error: string } | { ok: true; renglones: RenglonLeido[] };

/** Serie de fecha de Excel (días desde 1899-12-30) a 'AAAA-MM-DD'. */
export function fechaDeExcel(v: Celda): string | null {
  if (typeof v === 'number' && v > 0 && v < 2958466) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return null;
}

/** Número de una celda: acepta 1234,56 y 1.234,56 escritos como texto. */
function numeroDe(v: Celda): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim().replace(/\s/g, '');
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const vacio = (v: Celda) => v === null || (typeof v === 'string' && v.trim() === '');

export function leerPlantilla<C>(
  filas: Celda[][],
  plantilla: Plantilla<C>,
  contexto: C,
): ResultadoLectura {
  const encabezado = (filas[0] ?? []).map((h) =>
    typeof h === 'string' ? h.trim() : h === null ? '' : String(h),
  );
  const esperadas = plantilla.columnas.map((c) => c.clave);
  const presentes = encabezado.filter((h) => h !== '');
  const faltan = esperadas.filter((c) => !presentes.includes(c));
  const sobran = presentes.filter((h) => !esperadas.includes(h));
  const repetidas = presentes.filter((h, i) => presentes.indexOf(h) !== i);
  if (faltan.length || sobran.length || repetidas.length) {
    const partes = [
      faltan.length ? `faltan las columnas ${faltan.join(', ')}` : '',
      sobran.length ? `sobran ${sobran.join(', ')}` : '',
      repetidas.length ? `están repetidas ${repetidas.join(', ')}` : '',
    ].filter(Boolean);
    return {
      ok: false,
      error: `La planilla no respeta la plantilla «${plantilla.titulo}»: ${partes.join('; ')}. Descargá la plantilla desde «Más información».`,
    };
  }
  const indice = new Map(encabezado.map((h, i) => [h, i]));
  const renglones: RenglonLeido[] = [];
  filas.slice(1).forEach((f, i) => {
    if (f.every(vacio)) return; // renglón en blanco: no cuenta
    const datos: Record<string, Celda> = {};
    const errores: string[] = [];
    for (const c of plantilla.columnas) {
      const crudo = f[indice.get(c.clave)!] ?? null;
      if (vacio(crudo)) {
        datos[c.clave] = null;
        if (c.requerida) errores.push(`falta ${c.clave}`);
        continue;
      }
      if (c.tipo === 'numero') {
        const n = numeroDe(crudo);
        if (n === null) errores.push(`${c.clave} no es un número («${String(crudo)}»)`);
        datos[c.clave] = n;
      } else if (c.tipo === 'fecha') {
        const d = fechaDeExcel(crudo);
        if (d === null)
          errores.push(`${c.clave} no es una fecha («${String(crudo)}»; usá dd/mm/aaaa)`);
        datos[c.clave] = d;
      } else {
        const t = String(crudo).trim();
        if (c.valores && !c.valores.some((x) => x.toLowerCase() === t.toLowerCase()))
          errores.push(`${c.clave} tiene que ser ${c.valores.join(', ')} («${t}»)`);
        datos[c.clave] = c.valores?.find((x) => x.toLowerCase() === t.toLowerCase()) ?? t;
      }
    }
    const v = errores.length
      ? { accion: 'crear' as const, errores: [] }
      : plantilla.validar(datos, contexto);
    const todos = [...errores, ...v.errores];
    renglones.push({
      numero: i + 2,
      datos,
      accion: todos.length ? 'error' : v.accion,
      errores: todos,
    });
  });
  if (renglones.length === 0)
    return { ok: false, error: 'La planilla no tiene renglones con datos.' };
  return { ok: true, renglones };
}

/** Planilla de ejemplo de una plantilla: encabezados y un renglón de muestra. */
export const filasDePlantilla = <C>(p: Plantilla<C>): Celda[][] => [
  p.columnas.map((c) => c.clave),
  p.columnas.map((c) => c.ejemplo),
];

// ---------------------------------------------------------------------------
// Plantilla: costos de materias primas (costo de referencia de Finanzas)
// ---------------------------------------------------------------------------

export interface ContextoCostos {
  /** código interno → unidad del catálogo y si ya tiene precio manual vigente. */
  insumos: Map<string, { unidad: string | null; tieneManual: boolean }>;
}

export const PLANTILLA_COSTOS_MP: Plantilla<ContextoCostos> = {
  clave: 'costos_materias_primas',
  titulo: 'Costos de materias primas',
  archivo: 'plantilla_costos_materias_primas.xlsx',
  descripcion:
    'Un precio de referencia por renglón, con o sin IVA (la base guarda el neto). Carga un precio nuevo para cada insumo (el anterior queda en el historial); no cambia lo que se pagó en cada lote. En líquidos y polvos, cantidad y unidad son las de la presentación de compra (D-42).',
  columnas: [
    {
      clave: 'codigo_insumo',
      tipo: 'texto',
      requerida: true,
      descripcion: 'Código interno del insumo, como en el catálogo',
      ejemplo: '101ESE',
    },
    {
      clave: 'importe',
      tipo: 'numero',
      requerida: true,
      descripcion: 'Precio de la presentación',
      ejemplo: 12000,
    },
    {
      clave: 'incluye_iva',
      tipo: 'texto',
      requerida: false,
      descripcion: 'Si el importe trae IVA (vacío = NO)',
      ejemplo: 'NO',
      valores: ['SI', 'NO'],
    },
    {
      clave: 'alicuota',
      tipo: 'numero',
      requerida: false,
      descripcion: 'Alícuota de IVA; sólo si incluye_iva es SI',
      ejemplo: null,
    },
    {
      clave: 'cantidad',
      tipo: 'numero',
      requerida: true,
      descripcion: 'Cantidad de la presentación',
      ejemplo: 500,
    },
    {
      clave: 'unidad',
      tipo: 'texto',
      requerida: true,
      descripcion: 'Unidad de la presentación',
      ejemplo: 'g',
      valores: ['g', 'kg', 'ml', 'l', 'UNIDAD'],
    },
    {
      clave: 'moneda',
      tipo: 'texto',
      requerida: true,
      descripcion: 'Moneda del importe',
      ejemplo: 'ARS',
      valores: ['ARS', 'USD'],
    },
    {
      clave: 'tipo_cambio',
      tipo: 'numero',
      requerida: false,
      descripcion: 'Pesos por dólar; sólo si la moneda es USD',
      ejemplo: null,
    },
    {
      clave: 'vigente_desde',
      tipo: 'fecha',
      requerida: false,
      descripcion: 'Desde cuándo rige (vacío = hoy)',
      ejemplo: '01/10/2026',
    },
    {
      clave: 'motivo',
      tipo: 'texto',
      requerida: false,
      descripcion: 'Por qué cambia (cotización, acuerdo…)',
      ejemplo: 'Cotización del proveedor',
    },
  ],
  validar: (f, ctx) => {
    const errores: string[] = [];
    const ins = ctx.insumos.get(String(f.codigo_insumo));
    if (!ins)
      errores.push(`no existe el insumo «${String(f.codigo_insumo)}» en el catálogo`);
    if (typeof f.importe === 'number' && f.importe <= 0)
      errores.push('el importe tiene que ser mayor que cero');
    if (f.incluye_iva === 'SI' && ![10.5, 21, 27].includes(f.alicuota as number))
      errores.push('con IVA incluido va la alícuota (10,5, 21 o 27)');
    if (f.incluye_iva !== 'SI' && f.alicuota !== null)
      errores.push('la alícuota va sólo si incluye_iva es SI');
    if (typeof f.cantidad === 'number' && f.cantidad <= 0)
      errores.push('la cantidad tiene que ser mayor que cero');
    if (f.moneda === 'USD' && !(typeof f.tipo_cambio === 'number' && f.tipo_cambio > 0))
      errores.push('en dólares hace falta el tipo de cambio');
    if (
      ins &&
      ins.unidad &&
      typeof f.cantidad === 'number' &&
      typeof f.unidad === 'string' &&
      convertirCantidad(f.cantidad, f.unidad, ins.unidad) === null
    )
      errores.push(
        `no se puede pasar ${f.unidad} a la unidad del catálogo (${ins.unidad})`,
      );
    if (ins && !ins.unidad)
      errores.push('el insumo no tiene unidad de medida en el catálogo');
    return { accion: ins?.tieneManual ? 'actualizar' : 'crear', errores };
  },
};
