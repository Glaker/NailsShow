import { describe, expect, it } from 'vitest';
import { totalesTandas, type TandaFila } from './consultasOrdenes';

const t = (unidades: number) => ({ unidades }) as TandaFila;

describe('totalesTandas', () => {
  it('día 1: 200 de 900, quedan 700; día 2: 400 más, quedan 300', () => {
    expect(totalesTandas([t(200)], 900)).toEqual({ hechas: 200, pendientes: 700 });
    expect(totalesTandas([t(200), t(400)], 900)).toEqual({
      hechas: 600,
      pendientes: 300,
    });
  });
  it('sin previstas no dice pendientes, y no baja de cero', () => {
    expect(totalesTandas([t(5)], null)).toEqual({ hechas: 5, pendientes: null });
    expect(totalesTandas([t(950)], 900).pendientes).toBe(0);
  });
});
