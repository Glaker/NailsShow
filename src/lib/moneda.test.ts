import { describe, expect, it } from 'vitest';
import {
  convertir,
  ipcDelMes,
  leyendaVista,
  mesBasePorDefecto,
  type SeriesMacro,
} from './moneda';

const p = (mes: string, valor: number, provisorio = false) => ({
  mes,
  valor,
  provisorio,
});

const series: SeriesMacro = {
  ipc: [p('2026-01', 100), p('2026-02', 110), p('2026-03', 200)],
  tcPromedio: [p('2026-01', 1000), p('2026-03', 1500)],
  tcCierre: [p('2026-01', 1100), p('2026-03', 1600)],
};

describe('conversión de moneda', () => {
  it('pesos corrientes no transforma', () => {
    expect(convertir(1234, '2026-01', 'CORRIENTE', 'FLUJO', series).valor).toBe(1234);
  });

  it('con el IPC al doble, un importe fijo vale la mitad en pesos constantes', () => {
    // base = marzo (200); enero (100) se lleva a marzo multiplicando por 2,
    // y un importe de marzo expresado en pesos de enero vale la mitad.
    expect(convertir(1000, '2026-01', 'CONSTANTE', 'FLUJO', series).valor).toBe(2000);
    expect(
      convertir(1000, '2026-03', 'CONSTANTE', 'FLUJO', series, '2026-01').valor,
    ).toBe(500);
  });

  it('el mes base es el último con IPC definitivo', () => {
    expect(mesBasePorDefecto(series.ipc)).toBe('2026-03');
    expect(mesBasePorDefecto([...series.ipc, p('2026-04', 210, true)])).toBe('2026-03');
  });

  it('flujo con promedio, saldo con cierre', () => {
    expect(convertir(3000, '2026-03', 'USD', 'FLUJO', series).valor).toBe(2);
    expect(convertir(3200, '2026-03', 'USD', 'SALDO', series).valor).toBe(2);
  });

  it('sin tipo de cambio del mes no se convierte a dólares', () => {
    expect(convertir(100, '2026-02', 'USD', 'FLUJO', series)).toEqual({
      valor: null,
      provisorio: false,
    });
  });

  it('el IPC faltante se estima con la última variación y sale provisorio', () => {
    const ipc = [p('2026-01', 100), p('2026-02', 110)];
    const abril = ipcDelMes(ipc, '2026-04');
    expect(abril.provisorio).toBe(true);
    expect(abril.valor).toBeCloseTo(110 * 1.1 * 1.1, 9);
    expect(ipcDelMes(ipc, '2025-12').valor).toBeNull();
  });

  it('una conversión con IPC estimado sale provisoria', () => {
    const r = convertir(1000, '2026-04', 'CONSTANTE', 'FLUJO', series, '2026-03');
    expect(r.provisorio).toBe(true);
    // marzo/feb = 200/110: abril estimado = 200 × 200/110
    expect(r.valor).toBeCloseTo((1000 * 200) / ((200 * 200) / 110), 9);
  });

  it('la leyenda dice en qué moneda está el gráfico', () => {
    expect(leyendaVista('CONSTANTE', '2026-09', 'A3500')).toBe(
      'en pesos constantes de sep-2026',
    );
    expect(leyendaVista('USD', null, 'A3500')).toBe('en dólares (A3500)');
  });
});
