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
  /** Identidad de la densidad en la base: con ella se buscan los pares. */
  id?: string;
  nombre?: string;
  /** g/mol. Null en mezclas naturales (vaselina, aceites): quedan fuera del V^E. */
  masaMolar?: number | null;
  /**
   * Si la densidad no es un compuesto puro («Etanol 96 GL»), sus
   * constituyentes con su fracción másica (gmp.densidad_composicion).
   */
  composicion?: { constituyente: Densidad; fraccion: number }[] | null;
}

/** Par binario Redlich-Kister (gmp.pares_volumen_exceso). */
export interface ParVolumenExceso {
  compuesto1Id: string;
  compuesto2Id: string;
  /** A_0..A_n, cm³/mol. */
  a: number[];
  /** dA_k/dT, cm³/mol/°C. */
  daDt: number[];
  tRefC: number;
}

export interface ResultadoMezcla {
  /** Aditividad de volúmenes: 1 / Σ w_i/ρ_i. */
  densidadIdeal: number;
  /** Con la corrección por volumen de exceso de los pares con datos. */
  densidadReal: number;
  /** cm³/mol. Negativo = la mezcla se contrae. */
  volumenExcesoMolar: number;
  /** (V_real / V_ideal − 1)·100. */
  cambioVolumenPct: number;
  paresConDatos: number;
  /** Pares presentes sin coeficientes: se asumieron ideales. */
  paresSinDatos: string[];
  /** Componentes sin masa molar: suman volumen pero no entran al V^E. */
  sinMasaMolar: string[];
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
  /** Nombre del compuesto de la densidad, para mostrar de dónde sale. */
  densidadNombre?: string | null;
  /** 'formula' = elegida en la fórmula; 'insumo' = la del insumo por defecto. */
  densidadOrigen?: 'formula' | 'insumo' | null;
  etapa?: string | null;
}

export interface Formula {
  componentes: ComponenteFormula[];
  /** Pares con datos de volumen de exceso. Sin esto la mezcla se toma ideal. */
  pares?: ParVolumenExceso[];
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
  densidadNombre: string | null;
  densidadOrigen: 'formula' | 'insumo' | null;
  densidadNoVerificada: boolean;
  seMideAVolumen: boolean;
  etapa?: string | null;
}

export interface ResultadoLote {
  renglones: RenglonCalculado[];
  masaTotalKg: number;
  /** Suma de los volúmenes de los componentes con densidad conocida. */
  sumaVolumenesL: number;
  /** Lo pedido. Distinto de `sumaVolumenesL`, y está bien que lo sea. */
  volumenObjetivoL: number | null;
  /**
   * Densidad y volumen de la mezcla según el modelo (null si algún componente
   * no tiene densidad): cuánto se contrae al mezclar.
   */
  mezcla: (ResultadoMezcla & { volumenRealL: number; volumenIdealL: number }) | null;
  /** Densidad con la que se pasó el volumen objetivo a masa, y de dónde salió. */
  densidadProductoUsada: number | null;
  densidadProductoEstimada: boolean;
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

  // ---- La mezcla según el modelo (gmp.densidad_mezcla_formula) ------------
  // Solo se estima si todo lo que entra tiene densidad: con un componente sin
  // densidad el número no representaría al producto.
  const porcentaje = (c: ComponenteFormula) =>
    c.esCsp ? 100 - declarado : (c.porcentajePP ?? 0);
  const presentes = formula.componentes.filter((c) => porcentaje(c) > 0);
  const sinDensidad = presentes.filter((c) => !c.densidad).map((c) => c.componente);
  let mezclaModelo: ResultadoMezcla | null = null;
  if (presentes.length > 0 && sinDensidad.length === 0) {
    mezclaModelo = densidadMezcla(
      presentes.map((c) => ({ densidad: c.densidad!, masa: porcentaje(c) })),
      formula.pares ?? [],
      tempC,
    );
  }

  let masaBase: number;
  let densidadProductoUsada: number | null = null;
  let densidadProductoEstimada = false;
  if ('masaKg' in objetivo) {
    masaBase = objetivo.masaKg;
  } else if (formula.densidadProducto !== null) {
    densidadProductoUsada = formula.densidadProducto;
    masaBase = objetivo.volumenL * formula.densidadProducto;
  } else if (mezclaModelo) {
    // Sin densidad medida, la del modelo de mezcla (D-33). La medida manda
    // siempre que exista.
    densidadProductoUsada = mezclaModelo.densidadReal;
    densidadProductoEstimada = true;
    masaBase = objetivo.volumenL * mezclaModelo.densidadReal;
    avisos.push(
      'Densidad del producto estimada por el modelo de mezcla ' +
        `(${mezclaModelo.densidadReal.toFixed(4)} g/mL a ${tempC} °C), que es la que rige ` +
        'mientras no se cargue una medida con densitómetro (I.50.25).',
    );
  } else {
    throw new Error(
      'La fórmula no tiene densidad del producto terminado' +
        (sinDensidad.length > 0
          ? ` y no se puede estimar porque faltan densidades de: ${sinDensidad.join(', ')}`
          : '') +
        '. Un volumen objetivo no se puede convertir a masa: medirla con el densitómetro ' +
        '(I.50.25) o indicar el objetivo en masa.',
    );
  }

  // El rendimiento agranda la carga. Para sacar 2000 L con 97 % de rendimiento
  // hay que cargar 2000 / 0,97, no 2000 * 0,97.
  const masaTotalKg = masaBase / formula.rendimiento;

  let sumaVolumenesL = 0;

  const renglones = formula.componentes
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c): RenglonCalculado => {
      const porcentajePP = c.esCsp ? 100 - declarado : (c.porcentajePP ?? 0);
      const masaKg = (masaTotalKg * porcentajePP) / 100;

      let volumenL: number | null = null;
      let densidadAplicada: number | null = null;

      // Todo componente con densidad conocida se informa también en volumen,
      // con SU densidad a la temperatura de trabajo: el alcohol con la del
      // alcohol, el acetato con la del acetato. `seMideAVolumen` dice cómo se
      // carga en planta (probeta o balanza), no si se calcula el volumen.
      if (c.densidad) {
        densidadAplicada = densidadA(c.densidad, tempC);
        volumenL = masaKg / densidadAplicada;
        sumaVolumenesL += volumenL;
      } else if (c.seMideAVolumen) {
        avisos.push(
          `«${c.componente}» está marcado para medir a volumen pero no tiene densidad cargada. ` +
            'Se informa solo la masa.',
        );
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
        densidadNombre: c.densidad ? (c.densidadNombre ?? null) : null,
        densidadOrigen: c.densidad ? (c.densidadOrigen ?? null) : null,
        densidadNoVerificada: c.densidad?.fuente === 'LITERATURA',
        seMideAVolumen: c.seMideAVolumen,
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

  if (mezclaModelo) {
    if (mezclaModelo.paresSinDatos.length > 0) {
      avisos.push(
        `Sin datos de contracción para ${mezclaModelo.paresSinDatos.join(', ')}: se ` +
          'tomaron como mezcla ideal.',
      );
    }
    // Con un solo componente no hay contracción posible: el aviso sería ruido.
    if (mezclaModelo.sinMasaMolar.length > 0 && presentes.length > 1) {
      avisos.push(
        `${mezclaModelo.sinMasaMolar.join(', ')}: sin masa molar (mezcla natural), suma su ` +
          'volumen pero no entra en la corrección por contracción.',
      );
    }
  }

  return {
    renglones,
    masaTotalKg: redondear(masaTotalKg, 4),
    sumaVolumenesL: redondear(sumaVolumenesL, 4),
    volumenObjetivoL,
    mezcla: mezclaModelo
      ? {
          ...mezclaModelo,
          volumenIdealL: redondear(masaTotalKg / mezclaModelo.densidadIdeal, 4),
          volumenRealL: redondear(masaTotalKg / mezclaModelo.densidadReal, 4),
        }
      : null,
    densidadProductoUsada,
    densidadProductoEstimada,
    tempC,
    avisos,
  };
}

/**
 * Densidad de una mezcla, con contracción. Espejo de `gmp.densidad_mezcla()`
 * (20260924160000), que es la autoridad:
 *
 *     rho = 1 / [ Σ w_i/rho_i  +  V^E · Σ (w_i/M_i) ]
 *     V^E = Σ_pares x_i·x_j·Σ_k A_k(t)·(x_i − x_j)^k     (Redlich-Kister, Muggianu)
 *
 * Una densidad con composición («Etanol 96 GL») se reemplaza por sus
 * constituyentes. Un par sin coeficientes se toma ideal; un componente sin
 * masa molar suma su volumen y queda fuera del V^E. Las masas pueden venir en
 * cualquier unidad: solo importan las proporciones.
 */
export function densidadMezcla(
  componentes: { densidad: Densidad; masa: number }[],
  pares: ParVolumenExceso[],
  tempC: number,
): ResultadoMezcla {
  // Expandir mezclas y agrupar por compuesto.
  const porClave = new Map<string, { densidad: Densidad; masa: number }>();
  for (const c of componentes) {
    if (!(c.masa > 0)) continue;
    const partes = c.densidad.composicion?.length
      ? c.densidad.composicion.map((p) => ({
          densidad: p.constituyente,
          masa: c.masa * p.fraccion,
        }))
      : [{ densidad: c.densidad, masa: c.masa }];
    for (const p of partes) {
      const clave = p.densidad.id ?? p.densidad.nombre ?? `#${porClave.size}`;
      const previo = porClave.get(clave);
      if (previo) previo.masa += p.masa;
      else porClave.set(clave, { densidad: p.densidad, masa: p.masa });
    }
  }
  // Por nombre, como la base: los pares sin datos salen en el mismo orden.
  const lista = [...porClave.entries()]
    .map(([clave, v]) => ({ clave, ...v }))
    .sort((a, b) =>
      (a.densidad.nombre ?? a.clave).localeCompare(b.densidad.nombre ?? b.clave, 'es'),
    );
  const total = lista.reduce((a, c) => a + c.masa, 0);
  if (total <= 0) throw new Error('La mezcla no tiene masa.');
  const nombre = (i: number) => lista[i]!.densidad.nombre ?? lista[i]!.clave;

  let sumaWRho = 0;
  let sumaN = 0;
  const sinMasaMolar: string[] = [];
  const n = lista.map((c, i) => {
    sumaWRho += c.masa / total / densidadA(c.densidad, tempC);
    const mm = c.densidad.masaMolar ?? null;
    if (mm === null || mm <= 0) {
      sinMasaMolar.push(nombre(i));
      return 0;
    }
    const ni = c.masa / total / mm;
    sumaN += ni;
    return ni;
  });

  let ve = 0;
  let paresConDatos = 0;
  const paresSinDatos: string[] = [];
  for (let i = 0; i < lista.length; i++) {
    if (n[i] === 0) continue;
    for (let j = i + 1; j < lista.length; j++) {
      if (n[j] === 0) continue;
      const idI = lista[i]!.densidad.id;
      const idJ = lista[j]!.densidad.id;
      const par = pares.find(
        (p) =>
          (p.compuesto1Id === idI && p.compuesto2Id === idJ) ||
          (p.compuesto1Id === idJ && p.compuesto2Id === idI),
      );
      if (!par) {
        paresSinDatos.push(`${nombre(i)} + ${nombre(j)}`);
        continue;
      }
      paresConDatos++;
      const xi = n[i]! / sumaN;
      const xj = n[j]! / sumaN;
      // Invertido el par, los términos impares cambian de signo.
      const d = (par.compuesto1Id === idI ? 1 : -1) * (xi - xj);
      let suma = 0;
      par.a.forEach((ak, k) => {
        const coef = ak + (par.daDt[k] ?? 0) * (tempC - par.tRefC);
        suma += coef * (k === 0 ? 1 : d ** k);
      });
      ve += xi * xj * suma;
    }
  }

  const densidadIdeal = 1 / sumaWRho;
  const densidadReal = 1 / (sumaWRho + ve * sumaN);
  return {
    densidadIdeal,
    densidadReal,
    volumenExcesoMolar: ve,
    cambioVolumenPct: (densidadIdeal / densidadReal - 1) * 100,
    paresConDatos,
    paresSinDatos,
    sinMasaMolar,
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
 * Conversión °GL (% v/v a 20 °C) a % P/P de etanol en etanol-agua. Espejo de
 * `gmp.grado_alcoholico_a_pp()`.
 *
 * No es una regla de tres con densidades, justamente por la contracción: se
 * interpola en la tabla CRC de 1 % P/P en 1 % P/P (`gmp.etanol_agua_crc`),
 * donde el error de la interpolación lineal queda por debajo de 0,01 % P/P.
 * Lo que estaba mal era interpolar entre dos o tres puntos sueltos.
 *
 * Referencias (OIML R 22): 70 % v/v ≈ 62,4 % P/P; 96 % v/v ≈ 93,8 % P/P.
 */
export function gradoAlcoholicoAPP(
  pctVv: number,
  tabla: { pp: number; vv: number }[],
): number {
  const t = [...tabla].sort((a, b) => a.pp - b.pp);
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i]!;
    const b = t[i + 1]!;
    if (a.vv <= pctVv && pctVv <= b.vv) {
      return redondear(a.pp + ((pctVv - a.vv) * (b.pp - a.pp)) / (b.vv - a.vv), 4);
    }
  }
  throw new Error(
    `La graduación tiene que estar entre 0 y 100 % v/v (se pidió ${pctVv}).`,
  );
}
