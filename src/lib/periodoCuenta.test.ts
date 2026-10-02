import { describe, expect, it } from 'vitest';
import { periodoCuenta, saldoCorrido } from './consultasAdministracion';

const movs = saldoCorrido([
  { fecha: '2026-08-10', debe: 1000, haber: 0 },
  { fecha: '2026-09-05', debe: 500, haber: 0 },
  { fecha: '2026-09-20', debe: 0, haber: 700 },
  { fecha: '2026-10-01', debe: 200, haber: 0 },
]);

describe('cuenta corriente entre fechas', () => {
  it('saldo de arrastre, filas del período y saldo a fecha', () => {
    const p = periodoCuenta(movs, '2026-09-01', '2026-09-30');
    expect(p.anterior).toBe(1000);
    expect(p.visibles.map((m) => m.saldo)).toEqual([1500, 800]);
    expect(p.aFecha).toBe(800);
  });
  it('sin fechas es la cuenta entera', () => {
    const p = periodoCuenta(movs, null, null);
    expect(p.anterior).toBe(0);
    expect(p.visibles).toHaveLength(4);
    expect(p.aFecha).toBe(1000);
  });
  it('un período sin movimientos arrastra el saldo anterior', () => {
    expect(periodoCuenta(movs, '2026-08-15', '2026-08-31').aFecha).toBe(1000);
  });
});
