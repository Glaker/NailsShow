import { expect, test } from 'vitest';
import { colorDe } from './colores';

test('cada persona tiene su color, con o sin tildes y apellido', () => {
  expect(colorDe('Eliseo Agustín Coggiola')).toBe('#1b2a5c');
  expect(colorDe('Diego Segundo')).toBe('#111111');
  expect(colorDe('Matias Alonso')).toBe('#f2c200');
  expect(colorDe('Nazarena Bakás')).toBe('#12b5a8');
  expect(colorDe('Virginia Arleo')).toBe('#7b3fe4');
  expect(colorDe('Agustina')).toBe('#d6249f');
});

test('el resto recibe siempre el mismo color', () => {
  expect(colorDe('Pedro Pérez')).toBe(colorDe('pedro'));
  expect(colorDe(null)).toBe('#868e96');
});
