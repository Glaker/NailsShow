/**
 * Formato de fecha, hora y número en español rioplatense.
 *
 * Centralizado porque un registro BPF se lee en papel tanto como en pantalla:
 * si la misma fecha aparece con dos formatos distintos en dos pantallas, la
 * primera pregunta del inspector es cuál de las dos es la del sistema.
 */

const LOCALE = 'es-AR';
const ZONA = 'America/Argentina/Buenos_Aires';

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  // Una columna `date` llega como 'YYYY-MM-DD', que JavaScript lee como
  // medianoche UTC: en Buenos Aires es el día anterior. Se la ancla al mediodía.
  const d =
    typeof valor === 'string'
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00` : valor)
      : valor;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: ZONA,
  }).format(d);
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  }).format(d);
}

/**
 * Lo que entrega un calendario de Mantine 8 (`'YYYY-MM-DD'`), como fecha local.
 * `new Date('2026-10-22')` es la medianoche UTC: en Buenos Aires, el 21 a las
 * 21 h, y el calendario mostraba el día anterior al tocado.
 */
export function desdeCalendario(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(valor);
}

/** Fecha en formato ISO corto, la que va en un campo `date` de la base. */
export function fechaISO(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  const y = valor.getFullYear();
  const m = String(valor.getMonth() + 1).padStart(2, '0');
  const d = String(valor.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function numero(valor: number | string | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = typeof valor === 'string' ? Number(valor) : valor;
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Días que faltan para una fecha. Negativo si ya pasó. */
export function diasHasta(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const objetivo = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(objetivo.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);
}

/** Convierte SCREAMING_SNAKE_CASE de un enum a texto legible. */
export function etiquetaEnum(valor: string | null | undefined): string {
  if (!valor) return '—';
  const s = valor.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Plata en formato corto, pedido de Administración (2026-09-30): «$23k» por
 * debajo del millón y «$2,34M» desde el millón. Abajo de $10k lleva un
 * decimal («$1,5k») y abajo de $1k va entero («$850»): redondear eso a «1k»
 * o «0k» diría otra cosa.
 */
export function dineroCompacto(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const signo = n < 0 ? '−' : '';
  const f = (x: number, dec: number) =>
    x.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: dec });
  if (a >= 1_000_000) return `${signo}$${f(a / 1_000_000, 2)}M`;
  if (a >= 10_000) return `${signo}$${f(Math.round(a / 1000), 0)}k`;
  if (a >= 1000) return `${signo}$${f(a / 1000, 1)}k`;
  return `${signo}$${f(Math.round(a), 0)}`;
}
