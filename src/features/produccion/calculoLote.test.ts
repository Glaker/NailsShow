/**
 * Pruebas de `calculoLote.ts`.
 *
 * Por qué existen. La aritmética de este módulo está duplicada a propósito con
 * `gmp.calcular_lote()` en la base (ver la cabecera de `calculoLote.ts`): la
 * base emite la hoja de pesada, esto responde mientras el usuario mueve la
 * temperatura. Una duplicación deliberada necesita algo que fije el contrato de
 * las dos mitades, o deja de ser duplicación y pasa a ser divergencia.
 *
 * Los casos de validación de fórmula —un solo csp, suma exacta sin csp, y que
 * quede algo para el csp— son los mismos tres que valida
 * `gmp.fn_formula_coherente` (20260917110000), con la misma tolerancia. Si
 * alguien cambia un umbral de un lado, acá se nota.
 *
 * Los números esperados se eligieron para poder verificarse a mano. La fórmula
 * `formulaPatron` da cuentas exactas; la de sanitizante existe para los casos
 * donde interesa una densidad y un coeficiente de expansión reales.
 *
 * Sobre los constructores `comp()` y `renglon()`: el proyecto compila con
 * `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. Armar los
 * componentes con todas las propiedades explícitas, y buscar los renglones por
 * `orden` en vez de por índice, evita una capa de `?.` y `!` que en un archivo
 * de pruebas solo agrega ruido.
 */

import { describe, expect, it } from 'vitest';
import {
  calcularLote,
  corregirPorTitulo,
  densidadA,
  pesable,
  type ComponenteFormula,
  type Densidad,
  type Formula,
  type RenglonCalculado,
  type ResultadoLote,
} from './calculoLote';

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

function comp(c: {
  orden: number;
  componente: string;
  porcentajePP: number | null;
  esCsp?: boolean;
  seMideAVolumen?: boolean;
  densidad?: Densidad | null;
  codigoInterno?: string | null;
  etapa?: string | null;
}): ComponenteFormula {
  return {
    orden: c.orden,
    componente: c.componente,
    codigoInterno: c.codigoInterno ?? null,
    porcentajePP: c.porcentajePP,
    esCsp: c.esCsp ?? false,
    seMideAVolumen: c.seMideAVolumen ?? false,
    densidad: c.densidad ?? null,
    etapa: c.etapa ?? null,
  };
}

/** Renglón por número de orden. Falla con un mensaje útil si no está. */
function renglon(r: ResultadoLote, orden: number): RenglonCalculado {
  const x = r.renglones.find((y) => y.orden === orden);
  if (!x) throw new Error(`El resultado no tiene renglón con orden ${orden}`);
  return x;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Etanol absoluto. Densidad de certificado, beta de literatura. */
const ETANOL: Densidad = {
  densidadRef: 0.7893,
  tempRefC: 20,
  betaK: 1.09e-3,
  fuente: 'CERTIFICADO_PROVEEDOR',
};

const AGUA: Densidad = {
  densidadRef: 0.9982,
  tempRefC: 20,
  betaK: 2.07e-4,
  fuente: 'FARMACOPEA',
};

/** Sin beta: la densidad no se corrige por temperatura. */
const DENSA: Densidad = {
  densidadRef: 2,
  tempRefC: 20,
  betaK: null,
  fuente: 'MEDICION_PROPIA',
};

const LIVIANA: Densidad = {
  densidadRef: 0.5,
  tempRefC: 20,
  betaK: null,
  fuente: 'MEDICION_PROPIA',
};

/**
 * Fórmula de cuentas redondas: 50 + 30 declarado, csp 20. Densidades 2 y
 * 0,5 g/mL sin beta, para que los volúmenes den enteros.
 */
function formulaPatron(
  opciones: { densidadProducto?: number | null; rendimiento?: number } = {},
): Formula {
  return {
    componentes: [
      comp({ orden: 1, componente: 'Componente A', porcentajePP: 50 }),
      comp({
        orden: 2,
        componente: 'Componente B',
        porcentajePP: 30,
        seMideAVolumen: true,
        densidad: DENSA,
      }),
      comp({
        orden: 3,
        componente: 'Componente C (csp)',
        porcentajePP: null,
        esCsp: true,
        seMideAVolumen: true,
        densidad: LIVIANA,
      }),
    ],
    densidadProducto:
      opciones.densidadProducto === undefined ? 1 : opciones.densidadProducto,
    densidadTempC: 20,
    rendimiento: opciones.rendimiento ?? 1,
  };
}

/** Sanitizante en gel: el caso que motivó la corrección por temperatura. */
function formulaSanitizante(): Formula {
  return {
    componentes: [
      comp({
        orden: 1,
        componente: 'Alcohol etílico 96°',
        codigoInterno: '101MP',
        porcentajePP: 80,
        seMideAVolumen: true,
        densidad: ETANOL,
        etapa: 'Carga inicial',
      }),
      comp({
        orden: 2,
        componente: 'Glicerina',
        porcentajePP: 1.45,
        etapa: 'Carga inicial',
      }),
      comp({
        orden: 3,
        componente: 'Agua purificada',
        porcentajePP: null,
        esCsp: true,
        seMideAVolumen: true,
        densidad: AGUA,
        etapa: 'Ajuste',
      }),
    ],
    densidadProducto: 0.8672,
    densidadTempC: 20,
    rendimiento: 1,
  };
}

/** La misma fórmula patrón, con un componente reemplazado. */
function patronCon(orden: number, reemplazo: ComponenteFormula): Formula {
  const f = formulaPatron();
  return {
    ...f,
    componentes: f.componentes.map((c) => (c.orden === orden ? reemplazo : c)),
  };
}

/** Una fórmula armada solo con los componentes que se le pasen. */
function formulaCon(
  componentes: ComponenteFormula[],
  densidadProducto: number | null = 1,
): Formula {
  return { componentes, densidadProducto, densidadTempC: 20, rendimiento: 1 };
}

// ---------------------------------------------------------------------------
// densidadA
// ---------------------------------------------------------------------------

describe('densidadA', () => {
  it('sin beta devuelve la densidad de referencia, cualquiera sea la temperatura', () => {
    expect(densidadA(DENSA, -40)).toBe(2);
    expect(densidadA(DENSA, 20)).toBe(2);
    expect(densidadA(DENSA, 90)).toBe(2);
  });

  it('a la temperatura de referencia devuelve exactamente la densidad de referencia', () => {
    expect(densidadA(ETANOL, ETANOL.tempRefC)).toBe(ETANOL.densidadRef);
  });

  it('la densidad baja al subir la temperatura y sube al bajarla', () => {
    expect(densidadA(ETANOL, 30)).toBeLessThan(ETANOL.densidadRef);
    expect(densidadA(ETANOL, 10)).toBeGreaterThan(ETANOL.densidadRef);
  });

  it('aplica rho(T) = rho_ref * (1 - beta * (T - T_ref))', () => {
    // 0,7893 * (1 - 1,09e-3 * 10) = 0,7893 * 0,9891
    expect(densidadA(ETANOL, 30)).toBeCloseTo(0.7806966, 7);
  });

  /**
   * La afirmación del docstring de `densidadA`: entre fraccionar a 12 °C y a
   * 30 °C hay casi 2 % de diferencia de volumen para la misma masa de etanol.
   * Es el motivo por el que la temperatura es un parámetro y no una constante.
   */
  it('entre 12 °C y 30 °C el etanol cambia ~2 % de volumen a igual masa', () => {
    const volumenA12 = 1 / densidadA(ETANOL, 12);
    const volumenA30 = 1 / densidadA(ETANOL, 30);
    expect(volumenA30 / volumenA12 - 1).toBeCloseTo(0.0198, 4);
  });
});

// ---------------------------------------------------------------------------
// calcularLote — objetivo en masa
// ---------------------------------------------------------------------------

describe('calcularLote con objetivo en masa', () => {
  it('reparte la masa según el %P/P y resuelve el csp por diferencia', () => {
    const r = calcularLote(formulaPatron(), { masaKg: 100 });

    expect(r.masaTotalKg).toBe(100);
    expect(r.renglones.map((x) => x.masaKg)).toEqual([50, 30, 20]);
    // El csp no viene declarado: es 100 - 80.
    expect(renglon(r, 3).porcentajePP).toBe(20);
  });

  it('la suma de las masas de los renglones es la masa total', () => {
    const r = calcularLote(formulaSanitizante(), { masaKg: 1000 });
    const suma = r.renglones.reduce((a, x) => a + x.masaKg, 0);
    expect(suma).toBeCloseTo(r.masaTotalKg, 3);
  });

  it('calcula el volumen solo de los componentes que se miden a volumen', () => {
    const r = calcularLote(formulaPatron(), { masaKg: 100 });

    expect(renglon(r, 1).volumenL).toBeNull(); // se pesa
    expect(renglon(r, 2).volumenL).toBe(15); // 30 kg / 2,0
    expect(renglon(r, 3).volumenL).toBe(40); // 20 kg / 0,5
    expect(r.sumaVolumenesL).toBe(55);
  });

  it('sin volumen objetivo, volumenObjetivoL queda en null', () => {
    const r = calcularLote(formulaPatron(), { masaKg: 100 });
    expect(r.volumenObjetivoL).toBeNull();
  });

  it('ordena los renglones por orden aunque la fórmula venga desordenada', () => {
    const f = formulaPatron();
    const [a, b, c] = f.componentes;
    if (!a || !b || !c) throw new Error('fixture incompleta');

    const r = calcularLote(formulaCon([c, a, b]), { masaKg: 100 });
    expect(r.renglones.map((x) => x.orden)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// calcularLote — objetivo en volumen y rendimiento
// ---------------------------------------------------------------------------

describe('calcularLote con objetivo en volumen', () => {
  it('convierte volumen a masa con la densidad del producto terminado', () => {
    const r = calcularLote(formulaPatron({ densidadProducto: 0.9 }), { volumenL: 1000 });

    expect(r.masaTotalKg).toBe(900);
    expect(r.volumenObjetivoL).toBe(1000);
  });

  /**
   * La densidad del producto es el único puente entre «2000 L» y una masa, y
   * no se deduce de los componentes: los volúmenes no son aditivos. Sin ese
   * dato el cálculo no arranca, y tiene que decir por qué.
   */
  it('sin densidad del producto no se puede partir de un volumen', () => {
    const f = formulaPatron({ densidadProducto: null });
    expect(() => calcularLote(f, { volumenL: 1000 })).toThrow(/densidad del producto/i);
  });

  it('con objetivo en masa no hace falta la densidad del producto', () => {
    const f = formulaPatron({ densidadProducto: null });
    expect(() => calcularLote(f, { masaKg: 100 })).not.toThrow();
  });

  /**
   * El rendimiento agranda la carga, no la achica: para sacar 2000 L con 97 %
   * hay que cargar 2000 / 0,97. Invertir esta división es un error que no se
   * ve en el número —queda parecido— y aparece recién en el granel faltante.
   */
  it('el rendimiento divide, no multiplica', () => {
    const r = calcularLote(formulaPatron({ rendimiento: 0.97 }), { volumenL: 2000 });

    expect(r.masaTotalKg).toBe(2061.8557);
    expect(r.masaTotalKg).toBeGreaterThan(2000);
  });

  it('rendimiento 1 no altera la masa', () => {
    const r = calcularLote(formulaPatron({ rendimiento: 1 }), { volumenL: 1000 });
    expect(r.masaTotalKg).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Validación de la fórmula
//
// Los mismos tres casos que `gmp.fn_formula_coherente` (20260917110000)
// rechaza al pasar una fórmula a VIGENTE, con la misma tolerancia de 1e-4.
// ---------------------------------------------------------------------------

describe('validación de la fórmula', () => {
  it('rechaza más de un componente csp', () => {
    const f = patronCon(
      2,
      comp({ orden: 2, componente: 'Componente B', porcentajePP: null, esCsp: true }),
    );

    expect(() => calcularLote(f, { masaKg: 100 })).toThrow(/2 componentes csp/);
  });

  it('sin csp exige que la suma dé exactamente 100 %', () => {
    const f = formulaCon([
      comp({ orden: 1, componente: 'A', porcentajePP: 50 }),
      comp({ orden: 2, componente: 'B', porcentajePP: 30 }),
    ]);

    expect(() => calcularLote(f, { masaKg: 100 })).toThrow(/no hay componente csp/);
  });

  it('sin csp acepta una suma de 100 % exacta', () => {
    const f = formulaCon([
      comp({ orden: 1, componente: 'A', porcentajePP: 60 }),
      comp({ orden: 2, componente: 'B', porcentajePP: 40 }),
    ]);

    const r = calcularLote(f, { masaKg: 100 });
    expect(r.renglones.map((x) => x.masaKg)).toEqual([60, 40]);
  });

  /**
   * La tolerancia es 1e-4, igual que el `abs(v_suma - 100) > 0.0001` del
   * trigger. Un desvío por debajo pasa; uno por encima no. Si alguien afloja
   * un lado, este par de casos lo delata.
   */
  it('tolera un desvío menor a 1e-4 y rechaza uno mayor', () => {
    const conSuma = (suma: number) => () =>
      calcularLote(
        formulaCon([comp({ orden: 1, componente: 'A', porcentajePP: suma })]),
        {
          masaKg: 100,
        },
      );

    expect(conSuma(100.00005)).not.toThrow();
    expect(conSuma(100.001)).toThrow(/no hay componente csp/);
  });

  it('rechaza una fórmula con csp donde lo declarado ya llega a 100 %', () => {
    // 70 + 30 = 100: no queda nada para el csp.
    const f = patronCon(
      1,
      comp({ orden: 1, componente: 'Componente A', porcentajePP: 70 }),
    );
    expect(() => calcularLote(f, { masaKg: 100 })).toThrow(/no queda nada para el csp/);
  });

  it('rechaza una fórmula con csp donde lo declarado pasa de 100 %', () => {
    const f = patronCon(
      1,
      comp({ orden: 1, componente: 'Componente A', porcentajePP: 95 }),
    );
    expect(() => calcularLote(f, { masaKg: 100 })).toThrow(/no queda nada para el csp/);
  });
});

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

describe('avisos', () => {
  /**
   * La densidad de literatura sirve para estimar, no para fabricar. El aviso es
   * parte de lo que separa una vista previa de una hoja de pesada.
   */
  it('marca los componentes con densidad de literatura y avisa una sola vez', () => {
    const f = formulaCon([
      comp({
        orden: 1,
        componente: 'A',
        porcentajePP: 50,
        seMideAVolumen: true,
        densidad: { ...DENSA, fuente: 'LITERATURA' },
      }),
      comp({
        orden: 2,
        componente: 'B',
        porcentajePP: 50,
        seMideAVolumen: true,
        densidad: { ...LIVIANA, fuente: 'LITERATURA' },
      }),
    ]);

    const r = calcularLote(f, { masaKg: 100 });

    expect(renglon(r, 1).densidadNoVerificada).toBe(true);
    expect(renglon(r, 2).densidadNoVerificada).toBe(true);
    expect(r.avisos.filter((a) => /literatura/i.test(a))).toHaveLength(1);
  });

  it('no marca como no verificada una densidad de certificado, medición o farmacopea', () => {
    const r = calcularLote(formulaSanitizante(), { masaKg: 100 });

    expect(r.renglones.every((x) => !x.densidadNoVerificada)).toBe(true);
    expect(r.avisos.some((a) => /literatura/i.test(a))).toBe(false);
  });

  /**
   * Los volúmenes no son aditivos: la suma de los volúmenes de los componentes
   * no tiene por qué dar el volumen del lote. El aviso existe para que nadie
   * lea la diferencia como un error de cálculo.
   */
  it('avisa cuando la suma de volúmenes se aparta del volumen objetivo', () => {
    const r = calcularLote(formulaSanitizante(), { volumenL: 1000 });

    expect(r.sumaVolumenesL).not.toBeCloseTo(1000, 0);
    expect(r.avisos.some((a) => /no son aditivos/i.test(a))).toBe(true);
  });

  it('no avisa de volúmenes cuando el desvío es menor al 0,5 %', () => {
    // Densidad de producto 1 y un único componente a volumen de densidad 1: la
    // suma de volúmenes coincide con el objetivo.
    const f = formulaCon([
      comp({
        orden: 1,
        componente: 'Único',
        porcentajePP: 100,
        seMideAVolumen: true,
        densidad: {
          densidadRef: 1,
          tempRefC: 20,
          betaK: null,
          fuente: 'MEDICION_PROPIA',
        },
      }),
    ]);

    const r = calcularLote(f, { volumenL: 1000 });

    expect(r.sumaVolumenesL).toBe(1000);
    expect(r.avisos).toHaveLength(0);
  });

  it('no avisa de volúmenes cuando el objetivo se dio en masa', () => {
    const r = calcularLote(formulaSanitizante(), { masaKg: 1000 });
    expect(r.avisos.some((a) => /no son aditivos/i.test(a))).toBe(false);
  });

  /**
   * Rama defensiva. La base no deja llegar este caso: el CHECK
   * `componente_a_volumen_con_densidad` (20260917110000) exige `densidad_id`
   * cuando `se_mide_a_volumen`. Se prueba igual porque la calculadora también
   * corre sobre fórmulas a medio cargar en el formulario, antes de que la base
   * las vea.
   */
  it('informa solo la masa si un componente se mide a volumen y no tiene densidad', () => {
    const f = patronCon(
      2,
      comp({
        orden: 2,
        componente: 'Componente B',
        porcentajePP: 30,
        seMideAVolumen: true,
        densidad: null,
      }),
    );

    const r = calcularLote(f, { masaKg: 100 });

    expect(renglon(r, 2).masaKg).toBe(30);
    expect(renglon(r, 2).volumenL).toBeNull();
    expect(renglon(r, 2).densidadAplicada).toBeNull();
    expect(r.avisos.some((a) => /no tiene densidad cargada/i.test(a))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Temperatura de trabajo
// ---------------------------------------------------------------------------

describe('temperatura de trabajo', () => {
  it('por defecto calcula a 20 °C', () => {
    const r = calcularLote(formulaSanitizante(), { masaKg: 1000 });

    expect(r.tempC).toBe(20);
    expect(renglon(r, 1).densidadAplicada).toBe(ETANOL.densidadRef);
  });

  it('a mayor temperatura, misma masa y más volumen', () => {
    const frio = calcularLote(formulaSanitizante(), { masaKg: 1000 }, 12);
    const calor = calcularLote(formulaSanitizante(), { masaKg: 1000 }, 30);

    expect(renglon(calor, 1).masaKg).toBe(renglon(frio, 1).masaKg);
    expect(renglon(calor, 1).volumenL).toBeGreaterThan(renglon(frio, 1).volumenL ?? 0);
    expect(renglon(calor, 1).densidadAplicada).toBeLessThan(
      renglon(frio, 1).densidadAplicada ?? 0,
    );
  });

  it('la temperatura no toca los componentes que se pesan', () => {
    const frio = calcularLote(formulaSanitizante(), { masaKg: 1000 }, 12);
    const calor = calcularLote(formulaSanitizante(), { masaKg: 1000 }, 30);

    expect(renglon(calor, 2).masaKg).toBe(renglon(frio, 2).masaKg);
    expect(renglon(calor, 2).volumenL).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// corregirPorTitulo
// ---------------------------------------------------------------------------

describe('corregirPorTitulo', () => {
  it('con título 96 %P/P hay que cargar de más y entra agua', () => {
    const r = corregirPorTitulo(100, 96);

    expect(r.masaCargarKg).toBe(104.1667);
    expect(r.aguaAportadaKg).toBe(4.1667);
  });

  it('con título 100 % no corrige nada y no aporta agua', () => {
    const r = corregirPorTitulo(100, 100);

    expect(r.masaCargarKg).toBe(100);
    expect(r.aguaAportadaKg).toBe(0);
  });

  it('la masa a cargar menos el agua aportada cierra contra la teórica', () => {
    const r = corregirPorTitulo(250, 93.8);
    expect(r.masaCargarKg - r.aguaAportadaKg).toBeCloseTo(250, 3);
  });

  it('rechaza títulos fuera del rango 0-100 %P/P', () => {
    expect(() => corregirPorTitulo(100, 0)).toThrow(/entre 0 y 100/);
    expect(() => corregirPorTitulo(100, -5)).toThrow(/entre 0 y 100/);
    expect(() => corregirPorTitulo(100, 101)).toThrow(/entre 0 y 100/);
  });
});

// ---------------------------------------------------------------------------
// pesable
// ---------------------------------------------------------------------------

describe('pesable', () => {
  /**
   * El ejemplo del docstring: una balanza de resolución 1 g no sirve para los
   * 6 g de pigmento que pide la fórmula. La respuesta correcta no es redondear
   * sino avisar, así que la función informa el mínimo además del veredicto.
   */
  it('6 g en una balanza de 1 g de resolución no son pesables', () => {
    const r = pesable(0.006, 0.001);

    expect(r.pesable).toBe(false);
    expect(r.minimoKg).toBe(0.1);
  });

  it('el mínimo exacto sí es pesable', () => {
    expect(pesable(0.1, 0.001).pesable).toBe(true);
  });

  it('una cantidad holgada es pesable', () => {
    expect(pesable(5, 0.001).pesable).toBe(true);
  });

  it('el mínimo es resolución por divisiones, y las divisiones son configurables', () => {
    expect(pesable(0.5, 0.01).minimoKg).toBe(1);
    expect(pesable(0.5, 0.01, 20).minimoKg).toBe(0.2);
    expect(pesable(0.5, 0.01, 20).pesable).toBe(true);
  });

  it('una balanza de mayor resolución baja el mínimo', () => {
    expect(pesable(0.006, 0.00001).pesable).toBe(true);
  });
});
