/**
 * Informes de producción (D-tareas-1): el mensual de tareas por operaria y el
 * anual de unidades por SKU y semana. Funciones puras: la página los muestra
 * y los baja a Excel.
 */
import type { Celda } from '@/lib/xlsx';
import type { FilaTrabajo, ProduccionSemanal } from '@/lib/consultasTareasProduccion';
import { TEXTO_TIPO } from '@/lib/consultasTareasProduccion';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const dia = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const ENCABEZADO_MENSUAL = [
  'Fecha',
  'Producción',
  'Horario de entrada',
  'Horario de salida',
  'Tarea realizada',
  'Producto',
  'Cantidad',
  'Lote',
  'Inició',
  'Finalizó',
  'Con quién',
];

/** Una fila por operaria y rato de trabajo. Sin jornada cargada, 8 a 15. */
export function filasMensual(filas: FilaTrabajo[]): Celda[][] {
  return [
    ENCABEZADO_MENSUAL,
    ...filas.map((f) => [
      dia(f.fecha),
      f.operaria ?? '',
      (f.entrada ?? '08:00').slice(0, 5),
      (f.salida ?? '15:00').slice(0, 5),
      f.tipo === 'OTRA' ? f.descripcion : `${TEXTO_TIPO[f.tipo]} — ${f.descripcion}`,
      f.producto ? `${f.codigo_interno ?? ''} ${f.producto}`.trim() : '',
      Math.round(f.cantidad * 1000) / 1000,
      f.lote ?? '',
      hora(f.inicio),
      hora(f.fin),
      f.con_quien ?? 'Sola',
    ]),
  ];
}

/** Los viernes de un año (las semanas del informe anual cierran el viernes). */
export function viernesDelAnio(anio: number): string[] {
  const d = new Date(anio, 0, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  const r: string[] = [];
  while (d.getFullYear() === anio) {
    r.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
    d.setDate(d.getDate() + 7);
  }
  return r;
}

/**
 * SKU × viernes: cuánto se produjo de cada uno cada semana, y el total. Van
 * todos los SKU del catálogo, aunque no se hayan producido.
 */
export function matrizAnual(
  anio: number,
  productos: { id: string; codigo_interno: string; nombre: string }[],
  semanal: ProduccionSemanal[],
): Celda[][] {
  const viernes = viernesDelAnio(anio);
  const cant = new Map(semanal.map((s) => [`${s.producto_id}|${s.viernes}`, s.cantidad]));
  return [
    ['Código', 'Producto', ...viernes.map((v) => `Vie ${dia(v).slice(0, 5)}`), 'Total'],
    ...productos.map((p) => {
      const fila = viernes.map((v) => cant.get(`${p.id}|${v}`) ?? null);
      return [
        p.codigo_interno,
        p.nombre,
        ...fila,
        fila.reduce<number>((s, x) => s + (x ?? 0), 0),
      ];
    }),
  ];
}

export interface Productividad {
  usuario_id: string;
  operaria: string;
  unidades: number;
  horas: number;
  porHora: number;
}

/** Unidades por hora de cada operaria (de lo que le tocó en cada grupo). */
export function productividad(filas: FilaTrabajo[]): Productividad[] {
  const m = new Map<string, Productividad>();
  for (const f of filas) {
    const p = m.get(f.usuario_id) ?? {
      usuario_id: f.usuario_id,
      operaria: f.operaria ?? '—',
      unidades: 0,
      horas: 0,
      porHora: 0,
    };
    p.unidades += f.cantidad;
    p.horas += f.minutos / 60;
    m.set(f.usuario_id, p);
  }
  return [...m.values()]
    .map((p) => ({ ...p, porHora: p.horas > 0 ? p.unidades / p.horas : 0 }))
    .sort((a, b) => b.porHora - a.porHora);
}

/** Primer y último día de un mes «2026-10». */
export function limitesMes(mes: string): [string, string] {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(y, m, 0).getDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
}

/** Los últimos `n` meses, del actual hacia atrás, como «2026-10». */
export function mesesAtras(n: number, hoy = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
