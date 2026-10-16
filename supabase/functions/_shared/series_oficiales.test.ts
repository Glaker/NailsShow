import { describe, expect, it } from 'vitest';
import { fechaExcel, planDeCarga, puntosA3500, puntosIpc } from './series_oficiales';

/* Fechas como número de serie de Excel, igual que en com3500.xls. */
const serial = (iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

describe('fechaExcel', () => {
  it('convierte sin depender del huso', () => {
    expect(fechaExcel(serial('2026-10-14'))).toBe('2026-10-14');
    expect(fechaExcel(serial('2017-01-02'))).toBe('2017-01-02');
  });
});

describe('puntosA3500', () => {
  // Valores reales del com3500.xls bajado el 2026-10-15.
  const diarias = [
    [],
    [null, 'Fecha', 'Tipo de Cambio de Referencia'],
    [null, serial('2016-12-30'), 15.85],
    [null, serial('2026-09-29'), 1523.9697],
    [null, serial('2026-09-30'), 1517.5209],
    [null, serial('2026-10-13'), 1515.8543],
    [null, serial('2026-10-14'), 1514.5655],
  ];
  const mensuales = [
    ['Mes', 'Promedio'],
    [serial('2026-09-01'), 1513.887],
  ];
  const p = puntosA3500(diarias, mensuales, '2026-10-15');
  const de = (serie: string, mes: string) =>
    p.find((x) => x.serie === serie && x.mes === mes);

  it('mes cerrado: cierre del último día y promedio oficial, definitivos', () => {
    expect(de('TC_A3500_CIERRE', '2026-09-01')).toMatchObject({
      valor: 1517.5209,
      es_provisorio: false,
    });
    expect(de('TC_A3500_PROMEDIO', '2026-09-01')).toMatchObject({
      valor: 1513.887,
      es_provisorio: false,
    });
  });

  it('mes en curso: último día y media de lo publicado, provisorios', () => {
    expect(de('TC_A3500_CIERRE', '2026-10-01')).toMatchObject({
      valor: 1514.5655,
      es_provisorio: true,
    });
    expect(de('TC_A3500_PROMEDIO', '2026-10-01')).toMatchObject({
      valor: 1515.2099,
      es_provisorio: true,
    });
  });

  it('ignora lo anterior a 2017 y los encabezados', () => {
    expect(p.some((x) => x.mes < '2017-01-01')).toBe(false);
    expect(p).toHaveLength(4);
  });
});

describe('puntosIpc', () => {
  it('lee la respuesta de datos.gob.ar', () => {
    const p = puntosIpc({
      data: [
        ['2026-07-01', 12076.3937],
        ['2016-12-01', 100],
      ],
    });
    expect(p).toEqual([
      expect.objectContaining({
        serie: 'IPC',
        mes: '2026-07-01',
        valor: 12076.3937,
        es_provisorio: false,
      }),
    ]);
  });
  it('falla fuerte si cambia el formato', () => {
    expect(() => puntosIpc({ error: 'x' })).toThrow();
  });
});

describe('planDeCarga', () => {
  const punto = (valor: number, es_provisorio: boolean) => ({
    serie: 'TC_A3500_CIERRE' as const,
    mes: '2026-10-01',
    valor,
    fuente: 'BCRA',
    es_provisorio,
  });
  const fila = (valor: number, es_provisorio: boolean) => ({
    id: 'a',
    serie: 'TC_A3500_CIERRE' as const,
    mes: '2026-10-01',
    valor,
    es_provisorio,
  });

  it('inserta lo que falta', () => {
    expect(planDeCarga([], [punto(1, true)]).insertar).toHaveLength(1);
  });
  it('actualiza un provisorio que cambió o pasó a definitivo', () => {
    expect(planDeCarga([fila(1, true)], [punto(2, true)]).actualizar).toHaveLength(1);
    expect(planDeCarga([fila(1, true)], [punto(1, false)]).actualizar).toHaveLength(1);
    expect(planDeCarga([fila(1, true)], [punto(1, true)]).actualizar).toHaveLength(0);
  });
  it('nunca toca un definitivo', () => {
    expect(planDeCarga([fila(1, false)], [punto(2, false)])).toEqual({
      insertar: [],
      actualizar: [],
    });
  });
});
