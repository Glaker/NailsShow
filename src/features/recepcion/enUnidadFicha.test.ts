import { describe, expect, it } from 'vitest';
import { enUnidadFicha } from './FormularioRecepcion';

describe('cantidad tipeada en kg con la ficha en g', () => {
  it('se guarda ×1000, sin errores de coma flotante', () => {
    expect(enUnidadFicha(25, true)).toBe(25000);
    expect(enUnidadFicha(1.234, true)).toBe(1234);
    expect(enUnidadFicha(0.1, true)).toBe(100);
  });
  it('en la unidad de la ficha, o sin cantidad, queda igual', () => {
    expect(enUnidadFicha(25, false)).toBe(25);
    expect(enUnidadFicha(null, true)).toBeNull();
  });
});
