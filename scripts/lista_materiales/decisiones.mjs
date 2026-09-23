// ---------------------------------------------------------------------------
// Decisiones de interpretación de la hoja C.V.D. para la carga de listas de
// materiales. Todo lo que no es lectura mecánica de la planilla está acá, a la
// vista, y no enterrado en el generador.
//
// Indicaciones de la conducción del proyecto (2026-09-23):
//   - Solo bloques celestes.
//   - Monómero: versión «FAB» (granel 101MONO) con tapa ciega en 100 ml.
//   - Monómero premium (104): discontinuado.
//   - Líquidos en ml o litros se pasan a gramos con la densidad a 20 °C de
//     gmp.densidades_referencia.
//   - Aceite de cutícula: densidad de la vaselina líquida.
//   - Cremas: se compran a granel y solo se envasan.
//   - Esencia: densidad muy variable, va siempre en ml.
//   - Los insumos que falten se dan de alta (20260923135000).
// Lo demás (qué producto es cada bloque, en qué unidad está cada cantidad) es
// lectura de la planilla por quien escribió este archivo, con su razón al
// lado, y está para que la Dirección Técnica lo revise (D-28).
// ---------------------------------------------------------------------------

/**
 * Bloque de la planilla (celda del encabezado «CANT. UNIT.») → código de
 * producto en gmp.productos, o null con el motivo por el que no se carga.
 */
export const BLOQUES = {
  // Monómero: FAB con tapa ciega (decisión). Las variantes VIEJO / NUEVO /
  // FAB-flip-top quedan afuera.
  D249: {
    producto: '101',
    razon: 'MONOMERO 100ml FAB, tapa ciega (decisión 2026-09-23)',
  },
  J249: { producto: null, razon: 'Variante VIEJO: no vigente (decisión 2026-09-23)' },
  Y249: {
    producto: null,
    razon: 'Variante FAB con flip top: se eligió la de tapa ciega (decisión 2026-09-23)',
  },
  AF249: { producto: null, razon: 'Variante NUEVO: no vigente (decisión 2026-09-23)' },
  D257: { producto: '102', razon: 'MONOMERO 250ml FAB (decisión 2026-09-23)' },
  J257: { producto: null, razon: 'Variante VIEJO: no vigente (decisión 2026-09-23)' },
  AF257: { producto: null, razon: 'Variante NUEVO: no vigente (decisión 2026-09-23)' },
  D265: { producto: '103', razon: 'MONOMERO 500ml FAB (decisión 2026-09-23)' },
  AF265: { producto: null, razon: 'Variante NUEVO: no vigente (decisión 2026-09-23)' },

  D273: {
    producto: null,
    razon: 'Monómero premium 250 ml: discontinuado (indicación 2026-09-23)',
  },
  D281: { producto: '105', razon: 'PRIMER 8ml' },
  J281: { producto: '387', razon: 'PRIMER ACIDO 8ml' },
  R281: {
    producto: null,
    razon:
      'El bloque dice «201 ESMALTE TRADICIONAL» y no hay producto 201 en el catálogo',
  },
  D291: { producto: 'DUO01', razon: 'PRIMER LOW ACID + PREP' },
  J291: { producto: 'DUO02', razon: 'PRIMER ACID + PREP' },
  D322: { producto: '106', razon: 'BONDER' },

  // Los bloques de sanitizante no traen código: el encabezado dice «FORMULA».
  // Se identifican por lo que llevan: envase 391ENV / etiquetas 391ET
  // «SANITIZANTE AMOR 200ML» / fragancia AMOR / gatillo → producto 391.
  R435: {
    producto: '391',
    razon:
      'Sin código en la planilla; envase y etiquetas 391 «SANITIZANTE AMOR 200ML», con gatillo',
  },
  Y435: {
    producto: '392',
    razon: 'Sin código en la planilla; envase y etiquetas 392 «SANITIZANTE AMOR 125ML»',
  },
  Y450: {
    producto: null,
    razon:
      'Sanitizante 1 litro: la etiqueta NS-397ET no está en la planilla de inventario y el producto «335 SANITIZANTE 1LT.» no dice fragancia; no se puede asignar sin confirmar',
  },

  D450: { producto: '384', razon: 'CLEANSER 100ml FAB' },
  D459: { producto: '385', razon: 'CLEANSER 250ml FAB' },
  D468: { producto: '386', razon: 'CLEANSER 1lt FAB' },
  K482: { producto: null, razon: 'Removedor 1 litro: no hay producto en el catálogo' },
  R487: { producto: '192', razon: 'Removedor 120ml (producto 192 «removedor de 120ml»)' },

  K696: { producto: '370', razon: 'Crema humectante AMOR 240ml' },
  R696: { producto: '373', razon: 'Crema humectante AMOR 100ml' },
  Y696: { producto: '367', razon: 'Crema exfoliante AMOR 100ml' },
  K705: { producto: '371', razon: 'Crema humectante AIRE 240ml' },
  R705: { producto: '374', razon: 'Crema humectante AIRE 100ml' },
  Y705: { producto: '368', razon: 'Crema exfoliante AIRE 100ml' },
  K714: { producto: '372', razon: 'Crema humectante PAZ 240ml' },
  R714: { producto: '375', razon: 'Crema humectante PAZ 100ml' },
  Y714: { producto: '369', razon: 'Crema exfoliante PAZ 100ml' },
  R752: { producto: '381', razon: 'Aceite de cutícula AMOR 8ml' },
  R762: { producto: '378', razon: 'Aceite de cutícula AMOR 33ml' },
  K965: { producto: '321', razon: 'Toalla Nail Show' },
};

/**
 * Códigos que la planilla trae rotos (la celda de código apunta a otra fila) y
 * que se reconstruyen por la fórmula de costo del mismo renglón.
 * Clave: `${bloque}:${fila}`.
 */
const ALCOHOL_CEREAL = {
  codigo: '138CL1',
  razon:
    'la celda de código es «0»; el costo se calcula con INVENTARIO!J238, que es 138CL1',
};
const ALCOHOL_ISOPROPILICO = {
  codigo: '138CL2',
  razon:
    'la celda de código es «0»; el costo se calcula con INVENTARIO!J239, que es 138CL2',
};
export const CODIGOS = {
  'D450:455': ALCOHOL_CEREAL,
  'D450:456': ALCOHOL_ISOPROPILICO,
  'D459:464': ALCOHOL_CEREAL,
  'D459:465': ALCOHOL_ISOPROPILICO,
  'D468:473': ALCOHOL_CEREAL,
  'D468:474': ALCOHOL_ISOPROPILICO,
};

/**
 * Unidad en la que la planilla expresa la cantidad de cada insumo que no se
 * cuenta por unidad, leída de la fórmula de costo de la celda de al lado.
 * Clave: `${bloque}:${codigo en mayúsculas}`.
 *
 *   'g' / 'kg' / 'ml' / 'L' → el generador lo lleva a la unidad del catálogo
 *   null → ambigua: queda afuera, en pendientes.md
 *
 * Criterio general: el líquido principal se dosifica por volumen (alcohol,
 * agua, glicerina, monómero, aceite, granel líquido); los aditivos chicos por
 * masa (fragancia, pigmento, extractos), salvo la esencia, que va en ml por
 * indicación. El pigmento del sanitizante es un polvo, y eso muestra que el
 * total ≈ 200 del bloque mezcla gramos y mililitros: no prueba que todo esté
 * en ml.
 */
const bloques = (lista, tabla) =>
  Object.fromEntries(
    lista.flatMap((b) => Object.entries(tabla).map(([k, v]) => [`${b}:${k}`, v])),
  );

const MONOMERO = {
  '101MONO': {
    unidad: 'L',
    razon: 'costo = precio por litro del tacho de 200 L × cantidad; 0,1 para 100 ml',
  },
  '101ESE': {
    unidad: 'L',
    razon: 'misma escala que el monómero: 0,002 / 0,005 / 0,01 L para 100 / 250 / 500 ml',
  },
};
const SANITIZANTE = {
  '138CL1': { unidad: 'ml', razon: 'líquido principal, dosificado por volumen' },
  '135AGUA': { unidad: 'ml', razon: 'líquido principal, dosificado por volumen' },
  '135GLI': { unidad: 'ml', razon: 'líquido, dosificado por volumen' },
  '135FRA1': { unidad: 'g', razon: 'aditivo: mismo costeo por kg que en las cremas' },
  '135ALOE': { unidad: 'g', razon: 'aditivo, costeado por kg' },
  '148PIG': { unidad: 'g', razon: 'pigmento en polvo' },
};
const CLEANSER = {
  '384ESE': {
    unidad: 'L',
    razon: 'costo = precio por litro de esencia × cantidad; 0,0002 L = 0,2 ml por 100 ml',
  },
  '138CL1': {
    unidad: 'L',
    razon: 'costo = precio por litro × cantidad; 0,08 L por 100 ml',
  },
  '138CL2': {
    unidad: 'L',
    razon: 'costo = precio por litro × cantidad; 0,02 L por 100 ml',
  },
};
const CREMA = {
  '370CREMA': {
    unidad: 'kg',
    razon: 'costo = precio por kg × cantidad; 0,24 para 240 ml',
  },
  '371CREMA': { unidad: 'kg', razon: 'idem' },
  '372CREMA': { unidad: 'kg', razon: 'idem' },
  '364CREMA': { unidad: 'kg', razon: 'idem' },
  '365CREMA': { unidad: 'kg', razon: 'idem' },
  '366CREMA': { unidad: 'kg', razon: 'idem' },
  '135FRA1': { unidad: 'g', razon: 'aditivo, costeado por kg / 1000' },
  '135FRA2': { unidad: 'g', razon: 'idem' },
  '135FRA3': { unidad: 'g', razon: 'idem' },
};
const PRIMER = {
  '105MO': { unidad: 'L', razon: '0,008 L = 8 ml de primer por envase' },
  '387MO': { unidad: 'L', razon: '0,008 L = 8 ml de primer por envase' },
};

export const UNIDADES = {
  ...bloques(['D249', 'D257', 'D265'], MONOMERO),
  ...bloques(['R435', 'Y435'], SANITIZANTE),
  ...bloques(['D450', 'D459', 'D468'], CLEANSER),
  ...bloques(
    ['K696', 'R696', 'Y696', 'K705', 'R705', 'Y705', 'K714', 'R714', 'Y714'],
    CREMA,
  ),
  ...bloques(['D281', 'J281'], PRIMER),
  'D322:106LIQ': {
    unidad: 'L',
    razon: 'costo = precio por litro × cantidad; 0,008 L = 8 ml',
  },
  'R752:378ACE': { unidad: 'ml', razon: '8 para un envase de 8 ml' },
  'R762:378ACE': { unidad: 'ml', razon: '33 para un envase de 33 ml' },
  'R487:192REM': { unidad: 'ml', razon: 'costo = precio por litro / 1000 × 120 ml' },
  'R487:192ALOE': { unidad: 'g', razon: 'aditivo, costeado por kg / 1000' },
  'R487:192ENM': { unidad: 'g', razon: 'aditivo, costeado por kg / 1000' },
};

/**
 * Insumo → compuesto de gmp.densidades_referencia (por nombre), para pasar
 * volumen a masa. Solo los que se convierten.
 */
export const DENSIDADES = {
  '138CL1': {
    compuesto: 'Etanol 96 GL',
    razon: 'alcohol de cereal: etanol al 96 %, no absoluto',
  },
  '138CL2': { compuesto: '2-Propanol (IPA)', razon: 'alcohol isopropílico' },
  '135AGUA': { compuesto: 'Agua desionizada', razon: '' },
  '135GLI': { compuesto: 'Glicerina', razon: '' },
  '101MONO': {
    compuesto: 'Metacrilato de etilo (EMA)',
    razon: 'el monómero líquido de uñas es EMA; confirmar con la ficha del proveedor',
  },
  '378ACE': {
    compuesto: 'Vaselina líquida liviana (Paraffinum liquidum perliquidum)',
    razon: 'indicación del codirector técnico, 2026-09-23: vaselina líquida liviana',
  },
};
