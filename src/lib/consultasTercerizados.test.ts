import { describe, expect, it } from 'vitest';
import { COLORES_TERCERO, colorTercero } from './consultasTercerizados';

describe('colores de los clientes tercerizados', () => {
  it('no usan los colores reservados de los rótulos de I.20.2', () => {
    for (const reservado of ['green', 'lime', 'yellow', 'orange', 'red', 'gray']) {
      expect(COLORES_TERCERO).not.toContain(reservado);
    }
  });

  it('un color fuera de la paleta se muestra como teal', () => {
    expect(colorTercero({ color: 'red' })).toBe('teal');
    expect(colorTercero({ color: 'grape' })).toBe('grape');
    expect(colorTercero(null)).toBe('teal');
  });
});
