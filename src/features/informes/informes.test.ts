import { describe, expect, it } from 'vitest';
import {
  filasMensual,
  limitesMes,
  matrizAnual,
  mesesAtras,
  productividad,
  viernesDelAnio,
} from './informes';
import type { FilaTrabajo } from '@/lib/consultasTareasProduccion';

const fila = (o: Partial<FilaTrabajo>): FilaTrabajo => ({
  participacion_id: 'p',
  tramo_id: 't',
  tarea_id: 'ta',
  usuario_id: 'delia',
  operaria: 'Delia Britez',
  fecha: '2026-10-23',
  inicio: '2026-10-23T11:00:00Z',
  fin: '2026-10-23T12:00:00Z',
  minutos: 60,
  tipo: 'ENVASAR',
  descripcion: 'Envasar 500 unidades de Sanitizante',
  producto_id: 'x',
  codigo_interno: 'SAN-1',
  producto: 'Sanitizante',
  lote: '#2 23/10/26',
  cantidad: 250,
  cierre: 'COMPLETA',
  con_quien: 'Agustina Martinez',
  entrada: null,
  salida: null,
  ...o,
});

describe('informes de producción', () => {
  it('el mensual lleva horario, tarea, producto, cantidad, lote y con quién', () => {
    const [enc, f] = filasMensual([fila({})]);
    expect(enc).toContain('Con quién');
    expect(f?.slice(0, 8)).toEqual([
      '23/10/2026',
      'Delia Britez',
      '08:00',
      '15:00',
      'Envasar — Envasar 500 unidades de Sanitizante',
      'SAN-1 Sanitizante',
      250,
      '#2 23/10/26',
    ]);
    expect(f?.[10]).toBe('Agustina Martinez');
  });

  it('2026 tiene 52 viernes, del 2 de enero al 25 de diciembre', () => {
    const v = viernesDelAnio(2026);
    expect(v.length).toBe(52);
    expect(v[0]).toBe('2026-01-02');
    expect(v.at(-1)).toBe('2026-12-25');
  });

  it('el anual va por SKU y viernes, con total al final', () => {
    const m = matrizAnual(
      2026,
      [
        { id: 'a', codigo_interno: 'A', nombre: 'Uno' },
        { id: 'b', codigo_interno: 'B', nombre: 'Dos' },
      ],
      [
        { producto_id: 'a', viernes: '2026-01-02', cantidad: 10 },
        { producto_id: 'a', viernes: '2026-01-09', cantidad: 5 },
      ],
    );
    expect(m[0]?.at(-1)).toBe('Total');
    expect(m[1]?.slice(0, 4)).toEqual(['A', 'Uno', 10, 5]);
    expect(m[1]?.at(-1)).toBe(15);
    expect(m[2]?.at(-1)).toBe(0);
  });

  it('productividad: unidades por hora de lo que le tocó a cada una', () => {
    const p = productividad([fila({}), fila({ cantidad: 50, minutos: 30 })]);
    expect(p[0]?.unidades).toBe(300);
    expect(p[0]?.porHora).toBeCloseTo(200);
  });

  it('meses y límites', () => {
    expect(mesesAtras(3, new Date(2026, 0, 15))).toEqual([
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
    expect(limitesMes('2026-02')).toEqual(['2026-02-01', '2026-02-28']);
  });
});
