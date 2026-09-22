/**
 * Cálculo de lote a partir de una fórmula en %P/P.
 *
 * Funciones puras, sin acceso a red ni a Supabase: la misma aritmética que
 * `gmp.calcular_lote()` hace en la base. Está duplicada a propósito, y la
 * duplicación es la parte importante de este archivo: la base es la autoridad
 * cuando se emite una hoja de pesada, y esto es la vista previa que responde
 * mientras el usuario arrastra el control de temperatura. Si los dos números
 * no coinciden, el que manda es el de la base.
 *
 * Por qué la fórmula va en peso y no en volumen: la masa es aditiva siempre,
 * el volumen no. Mezclar etanol y agua contrae el volumen (volumen molar de
 * exceso negativo: las moléculas de agua se acomodan en los huecos de la red
 * de puentes de hidrógeno del etanol). 50 mL de cada uno dan unos 96,3 mL.
 */

export interface Densidad {
  /** g/mL, numéricamente igual a kg/L. Null cuando solo hay polinomio. */
  densidadRef: number | null;
  /** °C a la que se midió `densidadRef`. */
  tempRefC: number;
  /** Coeficiente de expansión volumétrica, K⁻¹. Null = no corregir. */
  betaK: number | null;
  /**
   * `[a0, a1, a2, a3, a4]` de rho(T) = a0 + a1·T + a2·T² + a3·T³ + a4·T⁴,
   * con T en °C. Null = no hay ajuste y se usa el modelo lineal.
   */
  coeficientes: number[] | null;
  /** Rango donde el ajuste vale. Fuera de él no se extrapola. */
  validoDesdeC: number;
  validoHastaC: number;
  fuente: 'LITERATURA' | 'CERTIFICADO_PROVEEDOR' | 'MEDICION_PROPIA' | 'FARMACOPEA';
}

export interface ComponenteFormula {
  orden: number;
  componente: string;
  codigoInterno?: string | null;
  /** Null cuando el componente es el csp: se calcula por diferencia. */
  porcentajePP: number | null;
  esCsp: boolean;
  seMideAVolumen: boolean;
  densidad?: Densidad | null;
  etapa?: string | null;
}

export interface Formula {
  componentes: ComponenteFormula[];
  /** Densidad medida del granel terminado, g/mL. No es la suma de nada. */
  densidadProducto: number | null;
  densidadTempC: number;
  /** Fracción, 1 = sin pérdida de proceso. */
  rendimiento: number;
}

export interface RenglonCalculado {
  orden: number;
  componente: string;
  codigoInterno?: string | null;
  porcentajePP: number;
  masaKg: number;
  volumenL: number | null;
  densidadAplicada: number | null;
  densidadNoVerificada: boolean;
  etapa?: string | null;
}

export interface ResultadoLote {
  renglones: RenglonCalculado[];
  masaTotalKg: number;
  /** Suma de los volúmenes de los componentes medidos a volumen. */
  sumaVolumenesL: number;
  /** Lo pedido. Distinto de `sumaVolumenesL`, y está bien que lo sea. */
  volumenObjetivoL: number | null;
  tempC: number;
  avisos: string[];
}

/**
 * Densidad de un componente a una temperatura, en g/mL.
 *
 * Dos modelos, en este orden:
 *
 * 1. **Ajuste polinómico** `rho(T) = a0 + a1·T + a2·T² + a3·T³ + a4·T⁴`, que es
 *    lo que trae la tabla de referencia cargada en `gmp.densidades_referencia`
 *    para 91 compuestos, válido de 0 a 45 °C.
 * 2. **Linealización** `rho_ref * (1 - beta * (T - T_ref))`, para las densidades
 *    que entran por certificado de lote o medición propia, donde hay un punto
 *    y a lo sumo un coeficiente de expansión.
 *
 * Fuera del rango de validez **no extrapola**: un ajuste de grado 4 se dispara
 * apenas se sale del intervalo donde se ajustó, y devolver un número que parece
 * una densidad es peor que fallar. Es el mismo criterio que `gmp.densidad_a()`,
 * que es la autoridad cuando se emite la hoja de pesada.
 *
 * La magnitud no es despreciable: entre fraccionar a 12 °C y a 30 °C hay casi
 * 2 % de diferencia de volumen para la misma masa de etanol, y en un producto
 * cuyo activo es el alcohol eso se come buena parte de la tolerancia.
 */
export function densidadA(d: Densidad, tempC: number): number {
  if (tempC < d.validoDesdeC || tempC > d.validoHastaC) {
    throw new Error(
      `La densidad está definida entre ${d.validoDesdeC} y ${d.validoHastaC} °C; ` +
        `se pidió a ${tempC} °C. No se extrapola.`,
    );
  }

  if (d.coeficientes && d.coeficientes.length > 0) {
    // Horner: menos operaciones y menos error de redondeo que evaluar potencias.
    let r = 0;
    for (let i = d.coeficientes.length - 1; i >= 0; i--) {
      r = r * tempC + (d.coeficientes[i] ?? 0);
    }
    return r;
  }

  if (d.densidadRef === null) {
    throw new Error('La densidad no tiene ni ajuste polinómico ni valor de referencia.');
  }
  if (d.betaK === null) return d.densidadRef;
  return d.densidadRef * (1 - d.betaK * (tempC - d.tempRefC));
}

/** Redondeo a n decimales sin el sesgo de `toFixed` sobre flotantes. */
function redondear(x: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round((x + Number.EPSILON) * f) / f;
}

/**
 * Explota una fórmula.
 *
 * Se indica el objetivo en volumen **o** en masa, nunca los dos. Con volumen,
 * hace falta la densidad del producto terminado: es el único puente entre
 * «2000 L de sanitizante» y una masa, y no se puede deducir de los
 * componentes.
 */
export function calcularLote(
  formula: Formula,
  objetivo: { volumenL: number } | { masaKg: number },
  tempC = 20,
): ResultadoLote {
  const avisos: string[] = [];
  const volumenObjetivoL = 'volumenL' in objetivo ? objetivo.volumenL : null;

  let masaBase: number;
  if ('masaKg' in objetivo) {
    masaBase = objetivo.masaKg;
  } else {
    if (formula.densidadProducto === null) {
      throw new Error(
        'La fórmula no tiene densidad del producto terminado. Sin ese dato, un volumen ' +
          'objetivo no se puede convertir a masa: medirla con el densitómetro (I.50.25).',
      );
    }
    masaBase = objetivo.volumenL * formula.densidadProducto;
  }

  // El rendimiento agranda la carga. Para sacar 2000 L con 97 % de rendimiento
  // hay que cargar 2000 / 0,97, no 2000 * 0,97.
  const masaTotalKg = masaBase / formula.rendimiento;

  const declarado = formula.componentes
    .filter((c) => !c.esCsp)
    .reduce((a, c) => a + (c.porcentajePP ?? 0), 0);

  const cantidadCsp = formula.componentes.filter((c) => c.esCsp).length;
  if (cantidadCsp > 1) {
    throw new Error(
      `La fórmula tiene ${cantidadCsp} componentes csp. Solo puede haber uno.`,
    );
  }
  if (cantidadCsp === 0 && Math.abs(declarado - 100) > 1e-4) {
    throw new Error(
      `Los componentes suman ${declarado.toFixed(4)} % y no hay componente csp. ` +
        'Sin csp la suma tiene que dar exactamente 100 %.',
    );
  }
  if (cantidadCsp === 1 && declarado >= 100) {
    throw new Error(
      `Los componentes declarados suman ${declarado.toFixed(4)} %, no queda nada para el csp.`,
    );
  }

  let sumaVolumenesL = 0;

  const renglones = formula.componentes
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c): RenglonCalculado => {
      const porcentajePP = c.esCsp ? 100 - declarado : (c.porcentajePP ?? 0);
      const masaKg = (masaTotalKg * porcentajePP) / 100;

      let volumenL: number | null = null;
      let densidadAplicada: number | null = null;

      if (c.seMideAVolumen) {
        if (!c.densidad) {
          avisos.push(
            `«${c.componente}» está marcado para medir a volumen pero no tiene densidad cargada. ` +
              'Se informa solo la masa.',
          );
        } else {
          densidadAplicada = densidadA(c.densidad, tempC);
          volumenL = masaKg / densidadAplicada;
          sumaVolumenesL += volumenL;
        }
      }

      return {
        orden: c.orden,
        componente: c.componente,
        codigoInterno: c.codigoInterno ?? null,
        porcentajePP: redondear(porcentajePP, 6),
        masaKg: redondear(masaKg, 4),
        volumenL: volumenL === null ? null : redondear(volumenL, 4),
        densidadAplicada:
          densidadAplicada === null ? null : redondear(densidadAplicada, 5),
        densidadNoVerificada: c.densidad?.fuente === 'LITERATURA',
        etapa: c.etapa ?? null,
      };
    });

  if (renglones.some((r) => r.densidadNoVerificada)) {
    avisos.push(
      'Hay componentes cuya densidad es un valor de literatura. Para fabricar, reemplazarlo ' +
        'por el del certificado del lote o por una medición propia.',
    );
  }

  if (volumenObjetivoL !== null && sumaVolumenesL > 0) {
    const desvio = Math.abs(sumaVolumenesL - volumenObjetivoL) / volumenObjetivoL;
    if (desvio > 0.005) {
      avisos.push(
        `La suma de volúmenes de los componentes (${sumaVolumenesL.toFixed(1)} L) no coincide ` +
          `con el volumen del lote (${volumenObjetivoL.toFixed(1)} L). Es esperable: los ` +
          'volúmenes no son aditivos. La masa sí se conserva.',
      );
    }
  }

  return {
    renglones,
    masaTotalKg: redondear(masaTotalKg, 4),
    sumaVolumenesL: redondear(sumaVolumenesL, 4),
    volumenObjetivoL,
    tempC,
    avisos,
  };
}

/**
 * Corrección por título de un insumo que no viene puro.
 *
 * El alcohol se compra a una graduación (96 °GL) y la fórmula puede estar
 * escrita sobre alcohol al 100 %. Si es así, hay que cargar de más:
 *
 *     m_cargada = m_teorica / (titulo / 100)
 *
 * y el agua que entra con el alcohol se descuenta del agua de fórmula, si no
 * el lote queda subdosificado en activo y sobredosificado en agua.
 *
 * `titulo` se toma del protocolo del lote que se va a usar, no de un valor
 * nominal: dos tambores del mismo proveedor no tienen el mismo título.
 */
export function corregirPorTitulo(
  masaTeoricaKg: number,
  tituloPorcentajePP: number,
): { masaCargarKg: number; aguaAportadaKg: number } {
  if (tituloPorcentajePP <= 0 || tituloPorcentajePP > 100) {
    throw new Error('El título tiene que estar entre 0 y 100 % P/P.');
  }
  const masaCargarKg = masaTeoricaKg / (tituloPorcentajePP / 100);
  return {
    masaCargarKg: redondear(masaCargarKg, 4),
    aguaAportadaKg: redondear(masaCargarKg - masaTeoricaKg, 4),
  };
}

/**
 * Mínimo pesable de una balanza.
 *
 * Convención habitual en farmacia: por debajo de 100 divisiones de escala, el
 * error relativo de la balanza deja de ser despreciable frente a la cantidad.
 * Una balanza de resolución 1 g no sirve para pesar 6 g de pigmento, y menos
 * para los 0,006 kg que pide la fórmula del sanitizante.
 *
 * Cuando la cantidad cae por debajo, la salida correcta no es redondear: es
 * avisar y sugerir premezcla o una balanza de mayor resolución.
 */
export function pesable(
  masaKg: number,
  resolucionBalanzaKg: number,
  divisionesMinimas = 100,
): { pesable: boolean; minimoKg: number } {
  const minimoKg = resolucionBalanzaKg * divisionesMinimas;
  return { pesable: masaKg >= minimoKg, minimoKg };
}

/**
 * NO IMPLEMENTADO A PROPÓSITO: conversión °GL (%v/v) a %P/P.
 *
 * La graduación Gay-Lussac es volumen/volumen. La conversión a peso/peso para
 * etanol-agua no es una regla de tres con densidades, justamente por la
 * contracción de volumen: hace falta la tabla alcoholométrica (OIML R 22).
 *
 * Referencias para verificar cualquier implementación futura:
 *   70 %v/v ≈ 62,4 %P/P
 *   96 %v/v ≈ 93,8 %P/P
 *
 * Una función que interpole linealmente entre esos puntos parece razonable y
 * está mal en el medio del rango. Mejor no tenerla que tenerla mal.
 */
