import { describe, expect, it } from 'vitest';
import { dineroCompacto } from './formato';

describe('dineroCompacto', () => {
  it('k abajo del millón, M desde el millón', () => {
    expect(dineroCompacto(23_000)).toBe('$23k');
    expect(dineroCompacto(999_400)).toBe('$999k');
    expect(dineroCompacto(2_340_000)).toBe('$2,34M');
    expect(dineroCompacto(1_000_000)).toBe('$1M');
  });
  it('lo chico no se redondea a cero', () => {
    expect(dineroCompacto(1_500)).toBe('$1,5k');
    expect(dineroCompacto(850)).toBe('$850');
    expect(dineroCompacto(0)).toBe('$0');
  });
  it('negativos con signo', () => {
    expect(dineroCompacto(-45_200)).toBe('−$45k');
    expect(dineroCompacto('-2500000')).toBe('−$2,5M');
  });
});
