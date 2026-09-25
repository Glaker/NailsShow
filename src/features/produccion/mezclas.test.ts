/**
 * Modelo de mezcla contra la planilla de densidades.
 *
 * El fixture lo genera scripts/densidades/generar_mezclas.mjs desde la misma
 * planilla que carga la base: compuestos, pares Redlich-Kister, los doce
 * resultados de referencia de la hoja «Mezclas (teoría)» y la tabla CRC. Si el
 * cálculo de acá se aparta de la planilla, lo dice esta prueba antes que Naza
 * en planta.
 */
import { describe, expect, it } from 'vitest';
import fixture from './mezclas.fixture.json';
import {
  calcularLote,
  densidadMezcla,
  gradoAlcoholicoAPP,
  type Densidad,
  type ParVolumenExceso,
} from './calculoLote';

const compuestos = new Map<string, Densidad>(
  fixture.compuestos.map((c) => [
    c.nombre,
    {
      id: c.nombre,
      nombre: c.nombre,
      masaMolar: c.masaMolar,
      densidadRef: null,
      tempRefC: 20,
      betaK: null,
      coeficientes: c.coeficientes,
      validoDesdeC: 0,
      validoHastaC: 45,
      fuente: 'LITERATURA',
    },
  ]),
);
const densidad = (n: string) => {
  const d = compuestos.get(n);
  if (!d) throw new Error(`Sin compuesto ${n}`);
  return d;
};
const pares: ParVolumenExceso[] = fixture.pares.map((p) => ({
  compuesto1Id: p.c1,
  compuesto2Id: p.c2,
  a: p.a,
  daDt: p.da,
  tRefC: 25,
}));

describe('densidad de mezclas: reproduce la planilla a 20 °C', () => {
  for (const r of fixture.referencias) {
    it(r.mezcla, () => {
      const m = densidadMezcla(
        r.componentes.map((c) => ({ densidad: densidad(c.nombre), masa: c.masa })),
        pares,
        20,
      );
      expect(Math.abs(m.densidadIdeal - r.densidadIdeal)).toBeLessThan(2e-6);
      expect(Math.abs(m.densidadReal - r.densidadReal)).toBeLessThan(2e-6);
    });
  }

  it('el orden de los componentes no cambia el resultado', () => {
    const a = densidadMezcla(
      [
        { densidad: densidad('Agua'), masa: 30 },
        { densidad: densidad('Etanol'), masa: 70 },
      ],
      pares,
      20,
    );
    const b = densidadMezcla(
      [
        { densidad: densidad('Etanol'), masa: 70 },
        { densidad: densidad('Agua'), masa: 30 },
      ],
      pares,
      20,
    );
    expect(a.densidadReal).toBeCloseTo(b.densidadReal, 12);
  });

  it('etanol y agua se contraen (V^E negativo); un par sin datos se informa', () => {
    const m = densidadMezcla(
      [
        { densidad: densidad('Etanol'), masa: 50 },
        { densidad: densidad('Agua'), masa: 50 },
        { densidad: densidad('Acetato de etilo'), masa: 1 },
      ],
      pares,
      20,
    );
    expect(m.cambioVolumenPct).toBeLessThan(-3);
    expect(m.paresSinDatos).toEqual(['Acetato de etilo + Agua']);
  });

  it('una densidad con composición se descompone en sus constituyentes', () => {
    const e96: Densidad = {
      ...densidad('Etanol'),
      id: 'Etanol 96 GL',
      nombre: 'Etanol 96 GL',
      masaMolar: null,
      composicion: [
        { constituyente: densidad('Etanol'), fraccion: 0.938431 },
        { constituyente: densidad('Agua'), fraccion: 0.061569 },
      ],
    };
    const m = densidadMezcla([{ densidad: e96, masa: 1 }], pares, 20);
    // CRC: 93 % p/p → 0,80999; 94 % → 0,80713 a 20 °C.
    expect(m.densidadReal).toBeGreaterThan(0.806);
    expect(m.densidadReal).toBeLessThan(0.8095);
    expect(m.paresConDatos).toBe(1);
  });
});

describe('calculadora de lote con el modelo de mezcla', () => {
  const formula = (densidadProducto: number | null) => ({
    componentes: [
      {
        orden: 1,
        componente: 'Etanol',
        porcentajePP: 70,
        esCsp: false,
        seMideAVolumen: true,
        densidad: densidad('Etanol'),
      },
      {
        orden: 2,
        componente: 'Agua',
        porcentajePP: null,
        esCsp: true,
        seMideAVolumen: false,
        densidad: densidad('Agua'),
      },
    ],
    pares,
    densidadProducto,
    densidadTempC: 20,
    rendimiento: 1,
  });

  it('sin densidad medida, un volumen objetivo usa la estimada y lo avisa', () => {
    const r = calcularLote(formula(null), { volumenL: 100 }, 20);
    expect(r.densidadProductoEstimada).toBe(true);
    expect(r.masaTotalKg).toBeCloseTo(100 * r.mezcla!.densidadReal, 3);
    expect(r.mezcla!.volumenRealL).toBeCloseTo(100, 3);
    expect(r.mezcla!.volumenIdealL).toBeGreaterThan(102);
    expect(r.avisos.some((a) => /estimada por el modelo de mezcla/.test(a))).toBe(true);
  });

  it('la densidad medida manda sobre la estimada', () => {
    const r = calcularLote(formula(0.88), { volumenL: 100 }, 20);
    expect(r.densidadProductoEstimada).toBe(false);
    expect(r.masaTotalKg).toBeCloseTo(88, 6);
  });

  it('si un componente no tiene densidad, no estima y lo dice', () => {
    const f = formula(null);
    f.componentes[1] = { ...f.componentes[1]!, densidad: undefined as never };
    expect(() => calcularLote(f, { volumenL: 100 }, 20)).toThrow(
      /faltan densidades de: Agua/,
    );
  });
});

describe('°GL a % P/P con la tabla CRC', () => {
  it.each([
    [96, 93.84],
    [70, 62.39],
    [0, 0],
    [100, 100],
  ])('%s % v/v → %s % P/P', (vv, pp) => {
    expect(gradoAlcoholicoAPP(vv, fixture.etanolAgua)).toBeCloseTo(pp, 1);
  });

  it('fuera de 0 a 100 no inventa', () => {
    expect(() => gradoAlcoholicoAPP(101, fixture.etanolAgua)).toThrow();
  });
});
