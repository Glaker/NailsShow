import { describe, expect, it } from 'vitest';
import { aUnidadFicha } from './FormularioRecepcion';

describe('unidad elegida al recibir, llevada a la de la ficha', () => {
  it('kg con la ficha en g: ×1000, sin errores de coma flotante', () => {
    expect(aUnidadFicha(25, 'kg', 'g').cantidad).toBe(25000);
    expect(aUnidadFicha(1.234, 'kg', 'g').cantidad).toBe(1234);
    expect(aUnidadFicha(0.1, 'kg', 'g').cantidad).toBe(100);
  });
  it('g con la ficha en kg, y ml con la ficha en L', () => {
    expect(aUnidadFicha(500, 'g', 'kg')).toEqual({
      cantidad: 0.5,
      unidad: 'kg',
      cambiaFicha: false,
    });
    expect(aUnidadFicha(250, 'ml', 'l').cantidad).toBe(0.25);
  });
  it('la misma unidad queda igual, con la grafía de la ficha', () => {
    expect(aUnidadFicha(25, 'kg', 'Kg')).toEqual({
      cantidad: 25,
      unidad: 'Kg',
      cambiaFicha: false,
    });
    expect(aUnidadFicha(null, 'UNIDAD', 'unidad').cantidad).toBeNull();
  });
  it('unidades con la ficha en kg: la ficha estaba mal y se corrige', () => {
    expect(aUnidadFicha(500, 'UNIDAD', 'kg')).toEqual({
      cantidad: 500,
      unidad: 'UNIDAD',
      cambiaFicha: true,
    });
  });
  it('ficha sin unidad: queda la elegida', () => {
    expect(aUnidadFicha(3, 'l', null)).toEqual({
      cantidad: 3,
      unidad: 'l',
      cambiaFicha: true,
    });
  });
});
