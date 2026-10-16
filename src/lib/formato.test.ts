import { describe, expect, it } from 'vitest';
import { dineroCompacto, fecha } from './formato';

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

describe('fecha', () => {
  it('una columna date se muestra en su día, no en el anterior', () => {
    expect(fecha('2026-10-20')).toBe('20/10/2026');
    expect(fecha('2026-01-01')).toBe('01/01/2026');
  });
  it('un timestamp se muestra en hora de Buenos Aires', () => {
    expect(fecha('2026-10-21T01:00:00Z')).toBe('20/10/2026');
  });
});
