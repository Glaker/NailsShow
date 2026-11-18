// Ítems reales de la factura X 00100-00005847 (posición redondeada), leídos con pdf.js.
import { describe, expect, it } from 'vitest';
import { facturadoPorCodigo, numeroAr, parsearFacturaX, type ItemTexto } from './facturaX';

const i = (x: number, y: number, str: string): ItemTexto => ({ x, y, str });
const cabecera = (copia: string) => [
  i(300, 767, copia),
  i(369, 794, 'Nº: 00100-00005847'),
  i(409, 779, '17/11/2026'),
  i(34, 643, 'Señor/res:'),
  i(80, 643, 'ADRIEL SEBASTIAN GRECO'),
  i(493, 643, 'Nº Cliente:'),
  i(569, 642, '2811'),
  i(43, 575, 'Código'),
  i(284, 575, 'Cantidad'),
];
const fila = (y: number, cod: string, desc: string, cant: string, pu: string, bon: string, sub: string) => [
  i(27, y, cod),
  i(88, y, desc),
  i(296, y, cant),
  i(325, y, 'Otras Unidades'),
  i(427, y, pu),
  i(478, y, bon),
  i(507, y - 1, '0,000'),
  i(565, y, sub),
];
const pagina1 = (copia: string) => [
  ...cabecera(copia),
  ...fila(562, '79', 'VÍA LÁCTEA 45gr.', '24,000', '9.500,000', '0,00', '228.000,00'),
  ...fila(427, '372', 'HUMECTANTE PAZ 240ml.', '12,000', '5.500,000', '0,00', '66.000,00'),
];
const pagina2 = (copia: string) => [
  ...cabecera(copia).slice(0, 6),
  ...fila(577, '372', 'HUMECTANTE PAZ 240ml.', '3,000', '5.500,000', '100,00', '0,00'),
  ...fila(565, '321', 'TOALLA NAIL SHOW', '1,000', '2.000,000', '100,00', '0,00'),
  i(27, 391, 'Son PESOS'),
  i(27, 380, 'UN MILLON CIENTO CUARENTA Y SEIS'),
  i(426, 397, 'TOTAL:'),
  i(466, 397, '$'),
  i(546, 397, '1.000.146,00'),
];

describe('parsearFacturaX', () => {
  const f = parsearFacturaX([pagina1('ORIGINAL'), pagina2('ORIGINAL'), pagina1('DUPLICADO'), pagina2('DUPLICADO')]);

  it('lee la cabecera', () => {
    expect(f.numero).toBe('00100-00005847');
    expect(f.fecha).toBe('2026-11-17');
    expect(f.cliente).toBe('ADRIEL SEBASTIAN GRECO');
    expect(f.total).toBe(1000146);
  });

  it('lee solo el ORIGINAL, con los renglones bonificados y sin el pie', () => {
    expect(f.renglones.map((r) => [r.codigo, r.cantidad, r.bonificacion_pct])).toEqual([
      ['79', 24, 0],
      ['372', 12, 0],
      ['372', 3, 100],
      ['321', 1, 100],
    ]);
    expect(f.renglones[0]).toMatchObject({ precio_unitario: 9500, subtotal: 228000 });
  });

  it('suma por código', () => {
    expect(facturadoPorCodigo(f).get('372')).toBe(15);
  });
});

describe('numeroAr', () => {
  it('convierte el formato argentino', () => {
    expect(numeroAr('1.236.900,00')).toBe(1236900);
    expect(numeroAr('-428.640,92')).toBe(-428640.92);
    expect(numeroAr('Unidad')).toBeNull();
  });
});
