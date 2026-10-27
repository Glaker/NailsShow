import { describe, expect, it } from 'vitest';
import { textoUbicacion, type UbicacionInsumo } from '@/lib/consultasTareasProduccion';

const fila = (f: Partial<UbicacionInsumo>): UbicacionInsumo => ({
  insumo_id: 'a',
  codigo: 'MP-1',
  insumo: 'Alcohol',
  para: 'Fórmula',
  lote: 'RI-1',
  deposito: 'Materia prima — aprobada',
  estiba: 'B-12',
  saldo: 1,
  unidad: 'g',
  vence: null,
  ...f,
});

describe('dónde están las cosas, propuesto (D-tareas-3)', () => {
  it('un renglón por insumo, con el primer lote (el que vence antes)', () => {
    expect(
      textoUbicacion([
        fila({}),
        fila({ lote: 'RI-2', estiba: 'C-1' }),
        fila({
          insumo_id: 'b',
          insumo: 'Frasco',
          estiba: null,
          deposito: 'Depósito de envases 2',
        }),
        fila({
          insumo_id: 'c',
          insumo: 'Tapa',
          lote: null,
          deposito: null,
          estiba: null,
        }),
      ]),
    ).toBe(
      'Alcohol: Materia prima — aprobada · estiba B-12\nFrasco: Depósito de envases 2\nTapa: sin stock aprobado',
    );
  });
});
