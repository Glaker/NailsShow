import { describe, expect, it } from 'vitest';
import { comprobanteDeRecepcion, convertirCantidad, netoArs } from './consultasCostos';

// Mismos casos que supabase/tests/pglite/probar_costos.mjs: la regla de la
// pantalla tiene que dar lo mismo que la de la base.
describe('neto en pesos', () => {
  it('factura A con IVA incluido descuenta la alícuota', () => {
    expect(netoArs(12100, 'FACTURA_A', true, 21, 1)).toBe(10000);
  });
  it('factura A sin IVA incluido es el importe', () => {
    expect(netoArs(10000, 'FACTURA_A', false, 21, 1)).toBe(10000);
  });
  it('sin comprobante, B, C o no discriminado: el importe entero es costo', () => {
    for (const c of ['SIN_COMPROBANTE', 'FACTURA_B', 'FACTURA_C', 'NO_DISCRIMINADO'] as const)
      expect(netoArs(12100, c, true, 21, 1)).toBe(12100);
  });
  it('en dólares se lleva a pesos con el tipo de cambio', () => {
    expect(netoArs(0.323, null, null, null, 1540)).toBe(497.42);
  });
});

describe('conversión de cantidades', () => {
  it('kg a g y l a ml, sin distinguir mayúsculas', () => {
    expect(convertirCantidad(2, 'kg', 'g')).toBe(2000);
    expect(convertirCantidad(1, 'L', 'ml')).toBe(1000);
    expect(convertirCantidad(5, 'UNIDAD', 'unidad')).toBe(5);
  });
  it('masa ↔ volumen sólo con densidad', () => {
    expect(convertirCantidad(1, 'kg', 'ml')).toBeNull();
    expect(convertirCantidad(1, 'kg', 'ml', 0.8)).toBe(1250);
    expect(convertirCantidad(1, 'unidad', 'g', 1)).toBeNull();
  });
});

it('el comprobante de la recepción define el del costo', () => {
  expect(comprobanteDeRecepcion('SIN_FACTURA')).toBe('SIN_COMPROBANTE');
  expect(comprobanteDeRecepcion('FACTURA_B')).toBe('FACTURA_B');
});
