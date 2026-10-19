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
    for (const c of [
      'SIN_COMPROBANTE',
      'FACTURA_B',
      'FACTURA_C',
      'NO_DISCRIMINADO',
    ] as const)
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

describe('panel por producto', () => {
  it('margen sobre el precio', async () => {
    const { margenSobrePrecio } = await import('./consultasCostos');
    expect(margenSobrePrecio(100, 70)).toBeCloseTo(0.3, 10);
    expect(margenSobrePrecio(0, 70)).toBeNull();
  });
  it('si un componente del 25 % sube 20 %, el costo sube 5 %', async () => {
    const { sensibilidad } = await import('./consultasCostos');
    expect(sensibilidad(25, 100, 0.2)).toBeCloseTo(0.05, 10);
  });
});

describe('punto de equilibrio', () => {
  it('estructura / margen de contribución %', async () => {
    const { equilibrio } = await import('./consultasCostos');
    // Ventas 20.000, MC 12.000 (60 %), estructura 104.600 → 174.333,33.
    expect(equilibrio(20000, 12000, 104600)).toBeCloseTo(174333.3333, 3);
    expect(equilibrio(0, 0, 100)).toBeNull();
  });
  it('el veredicto no cambia con la moneda: escalar todo por un tipo de cambio escala el equilibrio igual', async () => {
    const { equilibrio } = await import('./consultasCostos');
    const tc = 1200;
    expect(equilibrio(20000 / tc, 12000 / tc, 104600 / tc)!).toBeCloseTo(
      174333.3333 / tc,
      6,
    );
  });
});
