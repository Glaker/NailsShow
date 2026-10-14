import { expect, test } from 'vitest';
import { proximaDePlanta } from './TareasProduccion';

test('la tarea de planta sigue el orden del batch record y salta lo de Calidad', () => {
  expect(proximaDePlanta([])).toBe('PESADA');
  expect(proximaDePlanta(['PESADA', 'MUESTREO_GRANEL'])).toBe('ELABORACION');
  expect(proximaDePlanta(['PESADA', 'ELABORACION', 'CC_GRANEL'])).toBe('FRACCIONAMIENTO');
  expect(proximaDePlanta(['PESADA', 'ELABORACION', 'FRACCIONAMIENTO'])).toBeNull();
});
