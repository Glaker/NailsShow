import { describe, expect, it } from 'vitest';
import { totalDeBultos } from './FormularioRecepcion';

describe('calculadora de bultos de la recepción', () => {
  it('bultos completos por la cantidad por bulto', () => {
    expect(totalDeBultos(5, 25, [])).toBe(125);
  });
  it('4 completos y uno por la mitad: la suma', () => {
    expect(totalDeBultos(5, 25, [12.5])).toBe(112.5);
  });
  it('todos con otra cantidad no necesitan cantidad por bulto', () => {
    expect(totalDeBultos(2, null, [3, 4])).toBe(7);
  });
  it('sin datos suficientes no inventa un total', () => {
    expect(totalDeBultos(5, null, [12.5])).toBeNull();
    expect(totalDeBultos(5, 25, [null])).toBeNull();
    expect(totalDeBultos(1, 25, [3, 4])).toBeNull();
  });
  it('sin errores de coma flotante', () => {
    expect(totalDeBultos(3, 0.1, [])).toBe(0.3);
  });
});
