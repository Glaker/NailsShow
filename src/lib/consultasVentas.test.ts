import { describe, expect, it } from 'vitest';
import { calcularVenta, descuentoPorMonto, proximoEscalon } from './consultasVentas';

// Escala de la lista 46.14 (celda H342). Mismos números que probar_ventas_central.mjs.
const escala = [
  { desde_monto: 0, porcentaje: 0 },
  { desde_monto: 625000, porcentaje: 20 },
  { desde_monto: 1000000, porcentaje: 25 },
  { desde_monto: 1450000, porcentaje: 30 },
  { desde_monto: 4616000, porcentaje: 35 },
];
const pack = { precio_promo: 3200, unidades_pack: 6, manual: null };
const mono = { precio_promo: 8500, unidades_pack: 1, manual: null };

describe('cuenta del pedido mayorista', () => {
  it('escala: bordes de cada escalón', () => {
    expect(
      [624999, 625000, 1449999, 1450000, 5e6].map((m) => descuentoPorMonto(m, escala)),
    ).toEqual([0, 20, 25, 30, 35]);
  });
  it('bajo $625 mil no hay descuento; el pack vale unidades × precio', () => {
    const c = calcularVenta([{ ...pack, cantidad: 5 }], escala, null);
    expect(c).toMatchObject({
      lista: 96000,
      descuento: 0,
      total: 96000,
      finales: [19200],
    });
  });
  it('al pasar el escalón el descuento va al pedido entero, redondeado a pesos por unidad', () => {
    const c = calcularVenta(
      [
        { ...pack, cantidad: 5 },
        { ...mono, cantidad: 70 },
      ],
      escala,
      null,
    );
    expect(c).toMatchObject({
      lista: 691000,
      descuento: 20,
      finales: [15360, 6800],
      total: 552800,
    });
    expect(proximoEscalon(c.lista, escala)).toEqual({ falta: 309000, porcentaje: 25 });
  });
  it('el descuento fijo y el precio a mano ganan', () => {
    const c = calcularVenta(
      [
        { ...pack, cantidad: 5 },
        { ...mono, cantidad: 70, manual: 6000 },
      ],
      escala,
      40,
    );
    expect(c.descuento).toBe(40);
    expect(c.finales).toEqual([11520, 6000]);
  });
});

describe('descuento por caja (D-descuento-caja-1)', () => {
  it('caja de 98 monómeros al 5 %, sin descuento del pedido: 791.350', () => {
    const c = calcularVenta(
      [{ cantidad: 98, precio_promo: 8500, unidades_pack: 1, manual: null, caja: 5 }],
      [],
      0,
    );
    expect(c.finales).toEqual([8075]);
    expect(c.total).toBe(791350);
  });
  it('se suma al del pedido: 8.500 × 0,80 = 6.800, × 0,95 = 6.460', () => {
    const c = calcularVenta(
      [{ cantidad: 1, precio_promo: 8500, unidades_pack: 1, manual: null, caja: 5 }],
      [],
      20,
    );
    expect(c.finales).toEqual([6460]);
  });
  it('el escalón del pedido se calcula sin el descuento por caja', () => {
    const c = calcularVenta(
      [{ cantidad: 98, precio_promo: 8500, unidades_pack: 1, manual: null, caja: 5 }],
      [],
      null,
    );
    expect(c.lista).toBe(833000);
  });
});

describe('caja mixta (D-caja-mixta-1)', () => {
  it('1 caja de 98 a 8.075 + 10 sueltas a 8.500: promedio 8.114,35', () => {
    const c = calcularVenta(
      [
        {
          cantidad: 108,
          precio_promo: 8500,
          unidades_pack: 1,
          manual: null,
          caja: 5,
          cantidad_caja: 98,
        },
      ],
      [],
      0,
    );
    expect(c.finales).toEqual([8114.35]);
    expect(c.total).toBe(876349.8);
  });
  it('sin unidades en caja no hay descuento de caja', () => {
    const c = calcularVenta(
      [
        {
          cantidad: 10,
          precio_promo: 8500,
          unidades_pack: 1,
          manual: null,
          caja: 5,
          cantidad_caja: 0,
        },
      ],
      [],
      0,
    );
    expect(c.finales).toEqual([8500]);
  });
});
