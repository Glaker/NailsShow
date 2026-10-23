import { describe, expect, it } from 'vitest';
import { acomodarEtiquetas } from './GraficoLineas';

describe('etiquetas al final de las líneas', () => {
  it('las que terminan en el mismo punto se juntan en una', () => {
    const e = acomodarEtiquetas(
      [
        { serie: 1, nombre: 'Consumidor final', x: 570, y: 40 },
        { serie: 2, nombre: 'Mayorista', x: 570, y: 40 },
        { serie: 0, nombre: 'Costo', x: 570, y: 200 },
      ],
      16,
      234,
    );
    expect(e.map((x) => x.texto)).toEqual(['Consumidor final · Mayorista', 'Costo']);
  });

  it('las cercanas se separan, sin pasarse del alto', () => {
    const e = acomodarEtiquetas(
      [
        { serie: 0, nombre: 'A', x: 570, y: 230 },
        { serie: 1, nombre: 'B', x: 570, y: 232 },
        { serie: 2, nombre: 'C', x: 570, y: 233 },
      ],
      16,
      234,
    );
    for (let i = 1; i < e.length; i++)
      expect(e[i]!.y - e[i - 1]!.y).toBeGreaterThanOrEqual(14);
    expect(e.at(-1)!.y).toBeLessThanOrEqual(234);
  });
});
