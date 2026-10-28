import { describe, expect, it } from 'vitest';
import { aContenido } from './consultasCostos';

describe('aContenido', () => {
  it('pasa kg y L a g y mL, que es lo que guarda la base', () => {
    expect(aContenido(0.25, 'kg')).toEqual({
      contenido_neto: 250,
      unidad_contenido: 'g',
    });
    expect(aContenido(1.5, 'L')).toEqual({
      contenido_neto: 1500,
      unidad_contenido: 'mL',
    });
    expect(aContenido(100, 'ml')).toEqual({
      contenido_neto: 100,
      unidad_contenido: 'mL',
    });
    expect(aContenido(30, 'g')).toEqual({ contenido_neto: 30, unidad_contenido: 'g' });
  });
});
