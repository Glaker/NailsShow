import { expect, test, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {},
  gmp: () => ({}),
  comercial: () => ({}),
  core: () => ({}),
}));
const { fraccionesMasicas } = await import('./consultas');

test('fracciones a 6 decimales que suman exactamente 1', () => {
  const f = fraccionesMasicas([33.3333, 33.3333, 33.3334]);
  expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  expect(f.every((x) => Math.round(x * 1e6) / 1e6 === x)).toBe(true);
  expect(fraccionesMasicas([60, 40])).toEqual([0.6, 0.4]);
});
