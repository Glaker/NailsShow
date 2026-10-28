import { describe, expect, it } from 'vitest';
import { hermanosDe, repartoDe } from './consultasHermanos';

const p = (id: string, familia_granel: string | null) => ({
  id,
  nombre: id,
  codigo_interno: id,
  familia_granel,
});

describe('hermanos', () => {
  const productos = [p('litro', 'f'), p('chico', 'f'), p('medio', 'f'), p('crema', null)];

  it('los de la misma familia, sin el propio', () => {
    expect(hermanosDe(productos, 'chico').map((x) => x.id)).toEqual(['litro', 'medio']);
    expect(hermanosDe(productos, 'crema')).toEqual([]);
  });

  it('el reparto manda solo lo que tiene unidades', () => {
    expect(repartoDe({ litro: 471, chico: '300', medio: '' })).toEqual([
      { producto_id: 'litro', unidades: 471 },
      { producto_id: 'chico', unidades: 300 },
    ]);
  });
});
