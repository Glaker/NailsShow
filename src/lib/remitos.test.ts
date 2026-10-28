import { describe, expect, it } from 'vitest';
import { nombreArchivoRemito, numeroRemito } from './consultasRemitos';

describe('remito', () => {
  it('numera PPPP-NNNNNNNN', () => {
    expect(numeroRemito(1, 12)).toBe('0001-00000012');
    expect(numeroRemito(3, 12345678)).toBe('0003-12345678');
  });
  it('cada archivo lleva su nombre', () => {
    const r = { letra: 'X' as const, punto_venta: 1, numero: 7 };
    expect(nombreArchivoRemito(r, false)).toBe('Remito X 0001-00000007 ORIGINAL');
    expect(nombreArchivoRemito(r, true)).toBe('Remito X 0001-00000007 COPIA');
  });
});
