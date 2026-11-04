import { describe, expect, it } from 'vitest';
import { aContenido, deContenido, totalOrden } from './consultasCostos';

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

  it('la orden: 100 ml por frasco × 50 frascos = 5 L', () => {
    expect(totalOrden(100, 'ml', 50)).toEqual({ cantidad: 5, unidad: 'L' });
    expect(totalOrden(0.25, 'kg', 3)).toEqual({ cantidad: 0.75, unidad: 'kg' });
    expect(totalOrden(14, 'g', 7)).toEqual({ cantidad: 0.098, unidad: 'kg' });
    expect(totalOrden(100, 'ml', 0)).toBeNull();
  });
});

it('deContenido muestra 1000 mL como 1 L y 120 mL como 120 ml', () => {
  expect(deContenido(1000, 'mL')).toEqual({ cantidad: 1, unidad: 'L' });
  expect(deContenido(120, 'mL')).toEqual({ cantidad: 120, unidad: 'ml' });
  expect(deContenido(2500, 'g')).toEqual({ cantidad: 2.5, unidad: 'kg' });
  expect(deContenido(null, null)).toEqual({ cantidad: '', unidad: 'g' });
});
