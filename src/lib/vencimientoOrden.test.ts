import { describe, expect, it } from 'vitest';
import { vencimientoISO, vencimientoPorDefecto } from './consultasOrdenes';

describe('vencimiento de la orden en MM/AA (D-orden-producto-1)', () => {
  it('por defecto, dos años después de la elaboración', () => {
    expect(vencimientoPorDefecto(new Date(2026, 9, 27))).toBe('10/28');
    expect(vencimientoPorDefecto(new Date(2026, 0, 31))).toBe('01/28');
  });
  it('MM/AA vence el último día de ese mes', () => {
    expect(vencimientoISO('10/28')).toBe('2028-10-31');
    expect(vencimientoISO('02/28')).toBe('2028-02-29');
    expect(vencimientoISO(' 06/30 ')).toBe('2030-06-30');
  });
  it('lo que no es MM/AA no vale', () => {
    for (const t of ['2028/10/31', '13/28', '0/28', '10/2028', '10-28', ''])
      expect(vencimientoISO(t), t).toBeNull();
  });
});
