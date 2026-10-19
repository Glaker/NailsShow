import { describe, expect, it } from 'vitest';
import {
  costearLinea,
  margenes,
  precioCotizacion,
  precioDesdeMargen,
  precioPorUnidadBase,
} from './cotizador';

// Mismos casos que supabase/tests/pglite/probar_cotizador.mjs.
describe('cotizador', () => {
  it('$12.000 por 500 g = $24.000 el kg', () => {
    expect(precioPorUnidadBase(12000, 500, 'g')! * 1000).toBeCloseTo(24000, 6);
  });
  it('insumo nuevo con IVA: 6 g a $12.000 los 500 g = $119,01', () => {
    const c = costearLinea({
      tipo: 'NUEVO',
      nombre: 'ZnO',
      cantidad: 6,
      unidad: 'g',
      merma: 0,
      precio: 12000,
      cantidadPresentacion: 500,
      unidadPresentacion: 'g',
      incluyeIva: true,
      alicuotaIva: 21,
    });
    expect(c.precioBase).toBeCloseTo(19.8347, 3);
    expect(c.subtotal).toBeCloseTo(119.01, 2);
  });
  it('mL con precio por kg: sin densidad se bloquea; con 1,26 son $37,80', () => {
    const base = {
      tipo: 'NUEVO' as const,
      nombre: 'Glicerina',
      cantidad: 10,
      unidad: 'ml',
      merma: 0,
      precio: 3000,
      cantidadPresentacion: 1,
      unidadPresentacion: 'kg',
      incluyeIva: false,
    };
    expect(costearLinea(base).falta).toMatch(/densidad/);
    expect(costearLinea({ ...base, densidad: 1.26 }).subtotal).toBeCloseTo(37.8, 4);
  });
  it('con IVA incluido: redondea el precio con IVA y deja el neto', () => {
    const r = precioCotizacion({
      costo: 456.81,
      modo: 'SOBRE_PRECIO',
      fija: 'MARGEN',
      margen: 0.3,
      precio: null,
      redondeo: 1,
      ivaIncluido: true,
      alicuota: 21,
    })!;
    expect(r.mostrado).toBe(790);
    expect(r.neto).toBeCloseTo(652.8926, 3);
  });
  it('costo libre por cantidad: 3 × $50', () => {
    expect(
      costearLinea({
        tipo: 'LIBRE',
        nombre: 'Análisis',
        cantidad: 3,
        unidad: 'unidad',
        merma: 0,
        precio: 50,
        incluyeIva: false,
      }).subtotal,
    ).toBe(150);
  });
  it('costo libre con merma 10 %: $90 → $100', () => {
    expect(
      costearLinea({
        tipo: 'LIBRE',
        nombre: 'Flete',
        cantidad: 1,
        unidad: 'unidad',
        merma: 0.1,
        precio: 90,
        incluyeIva: false,
      }).subtotal,
    ).toBe(100);
  });
  it('30 % sobre el precio = 42,9 % sobre el costo; el recargo da otro precio', () => {
    expect(precioDesdeMargen(456.81, 0.3, 'SOBRE_PRECIO', 1)).toBe(653);
    expect(precioDesdeMargen(100, 0.3, 'SOBRE_COSTO', 1)).toBe(130);
    const m = margenes(100, 100 / 0.7);
    expect(m.sobrePrecio).toBeCloseTo(0.3, 10);
    expect(m.sobreCosto).toBeCloseTo(0.4286, 4);
  });
});
