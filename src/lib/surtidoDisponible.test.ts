import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {}, gmp: () => ({}), comercial: () => ({}), core: () => ({}) }));
import { aromasDeSurtido } from './consultasVentas';

// comercial.surtido_disponible es una función de tabla: PostgREST devuelve una
// lista de una fila, no un objeto (bug encontrado al regenerar los tipos).
describe('aromasDeSurtido', () => {
  it('lee la primera fila de la lista', () => {
    expect(aromasDeSurtido([{ amor: 2, paz: 4, aire: 1 }])).toEqual({ amor: 2, paz: 4, aire: 1 });
  });
  it('sin filas o sin datos, cero', () => {
    expect(aromasDeSurtido([])).toEqual({ amor: 0, paz: 0, aire: 0 });
    expect(aromasDeSurtido(null)).toEqual({ amor: 0, paz: 0, aire: 0 });
  });
});
