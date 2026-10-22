import { describe, expect, it } from 'vitest';
import { POSICIONES_LOTEO, textoLote, textoVencimiento } from './posicionesLoteo';

describe('loteo', () => {
  it('la hoja tiene las 72 etiquetas de la plantilla, sin repetir', () => {
    expect(POSICIONES_LOTEO).toHaveLength(72);
    expect(new Set(POSICIONES_LOTEO.map((p) => p.join())).size).toBe(72);
  });

  it('el texto por defecto es el de la plantilla', () => {
    expect(textoLote('2026-10-20')).toBe('20102026');
    expect(textoVencimiento('2029-10-20')).toBe('v:10/29');
  });
});
