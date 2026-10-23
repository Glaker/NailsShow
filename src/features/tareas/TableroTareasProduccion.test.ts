import { describe, expect, it } from 'vitest';
import { colorGrupo, tramosContiguos } from './TableroTareasProduccion';

describe('tablero de tareas de Naza', () => {
  it('las operarias vecinas se funden en un rectángulo; las lejanas, aparte', () => {
    expect(tramosContiguos([2, 1, 3])).toEqual([[1, 3]]);
    expect(tramosContiguos([1, 4])).toEqual([
      [1, 1],
      [4, 4],
    ]);
    expect(tramosContiguos([5, 1, 2])).toEqual([
      [1, 2],
      [5, 5],
    ]);
  });

  it('el mismo grupo tiene el mismo color, sin importar el orden', () => {
    expect(colorGrupo(['delia', 'agus'])).toBe(colorGrupo(['agus', 'delia']));
    expect(colorGrupo([])).toBe('#868e96');
  });
});
