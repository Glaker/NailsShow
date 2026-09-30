#!/usr/bin/env node
/**
 * Manual de fórmulas de producción v10 → migración de carga + pendientes.md.
 *
 * Origen: App/manual_formulas_produccion_v10.pdf (fuera del repo), 17 páginas,
 * sha256 abajo. La transcripción de acá se hizo leyendo cada página renderizada,
 * no solo el texto extraído: pdftotext desordena varias tablas.
 *
 * Decisiones del usuario (2026-09-30):
 * - Una fórmula por SKU. Los PACK no llevan: son cajas de unidades.
 * - Navi, Glam y Jennifer Beauty: se dan de alta los clientes que faltan y sus
 *   productos, con los nombres del manual.
 * - El procedimiento lleva el texto del manual; los componentes llevan % p/p
 *   solo donde el manual da el peso en kg. Cucharadas y ml sin densidad
 *   quedan en el procedimiento. Todo en BORRADOR: aprueba la DT.
 *
 * Uso: node scripts/manual_formulas/generar_migracion.mjs [--borrador]
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
// --borrador: a supabase/tests/pglite/borradores/, para probarla antes de escribirla.
const ARCHIVO = '20260930170000_carga_manual_formulas.sql';
const MIGRACION = process.argv.includes('--borrador')
  ? join(RAIZ, 'supabase', 'tests', 'pglite', 'borradores', ARCHIVO)
  : join(RAIZ, 'supabase', 'migrations', ARCHIVO);
const ORIGEN = 'manual_formulas_produccion_v10.pdf';
const SHA256 = '5a9dc2c94042d7184dfbd8a2a2d0d87ff6e436e32c6e47e955481d49e8ec164a';

const BALANZA = 'BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.';

/* ------------------------------------------------------------------------- *
 * Componentes. `kg` = peso en balanza del manual por tanda; sin `kg`, el
 * componente no entra a la tabla de la fórmula y queda en el procedimiento.
 * `insumo` = código del catálogo; sin él, va por nombre (nombre_libre).
 * El de más peso es csp: absorbe el redondeo y la suma cierra en 100.
 * ------------------------------------------------------------------------- */

const I = {
  ISOPROPILICO: '138CL2',
  ACETATO_BUTILO: '136PRE',
  ALCOHOL_CEREAL: '138CL1',
  ALCOHOL_SANITIZANTE: '135SAN',
  AGUA: '135AGUA',
  GLICERINA: '135GLI',
  ALOE_GLICOLICO: '135ALOE',
  TUTTI_BAZOOK: '384ESE',
  CHICLE_PUMITA: '135FRA6',
  FRAMBUESA: '135FRA7',
  FRAGANCIA: { AMOR: '135FRA1', AIRE: '135FRA2', PAZ: '135FRA3' },
  PIGMENTO_AROMA: { AMOR: '148PIG', AIRE: '328PIG', PAZ: '158PIG' },
};

const AROMA_PASOS = {
  AMOR: [
    'Agregar 400 ml de ESENCIA AMOR en la olla de 40 L (2 bidones de 20 L).',
    'Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).',
    'Mezclar.',
    'Agregar 8 cucharadas de 2,5 ml de pigmento ROSA OSCURO #148 (total 20 ml).',
  ],
  AIRE: [
    'Agregar 400 ml de ESENCIA AIRE en la olla de 40 L (2 bidones de 20 L).',
    'Agregar 8 cucharadas de 2,5 ml de pigmento CAMALEON LILA #328 (total 20 ml).',
    'No lleva otro colorante.',
  ],
  PAZ: [
    'Agregar 400 ml de ESENCIA PAZ en la olla de 40 L (2 bidones de 20 L).',
    'Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).',
    'MEZCLAR BIEN.',
    'Agregar 2 y 1/2 cucharadas de 2,5 ml de colorante AZUL (total 6,25 ml).',
    'MEZCLAR BIEN.',
    'Agregar 8 cucharadas de 2,5 ml de pigmento VIOLETA #158 XVII (total 20 ml).',
    'PAZ: respetar este orden -> ROJO -> MEZCLAR -> AZUL -> MEZCLAR -> PIGMENTO VIOLETA #158 XVII.',
  ],
};

const numerar = (pasos) => pasos.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
const tabla = (filas) =>
  filas.map((f) => `  - ${f.nombre}: ${f.medida}${f.kg !== undefined ? ` — ${f.pesoTexto ?? `${coma(f.kg)} kg`}` : f.pesoTexto ? ` — ${f.pesoTexto}` : ''}`).join('\n');
/** 5 → «5,00», 0.04 → «0,04», 0.006 → «0,006»: como escribe el manual. */
const coma = (n) => {
  const dec = (String(n).split('.')[1] ?? '').length;
  return n.toFixed(Math.max(2, dec)).replace('.', ',');
};

/** Arma el texto del procedimiento con la forma del manual. */
function procedimiento({ titulo, pagina, componentes, pasos, notas = [] }) {
  return [
    `${titulo}`,
    `Fuente: ${ORIGEN}, página ${pagina}.`,
    '',
    BALANZA,
    '',
    'COMPONENTES (cantidad por tanda — peso en balanza)',
    tabla(componentes),
    '',
    'ORDEN DE PREPARACION',
    numerar(pasos),
    ...(notas.length ? ['', ...notas] : []),
  ].join('\n');
}

/* ------------------------------------------------------------------------- *
 * Fórmulas del manual. `skus` = códigos existentes de Nail Show; `nuevos` =
 * productos a dar de alta para un tercero.
 * ------------------------------------------------------------------------- */

const prep = (marca, pagina, notas = []) => ({
  titulo: `PREP ${marca} - BIDON DE 20 L`,
  pagina,
  componentes: [
    { nombre: 'Alcohol isopropilico', medida: '14,00 L', kg: 10.99, insumo: I.ISOPROPILICO },
    { nombre: 'Acetato de butilo', medida: '6,00 L', kg: 5.28, insumo: I.ACETATO_BUTILO },
  ],
  pasos: ['Agregar alcohol isopropilico.', 'Agregar acetato de butilo.', 'Mezclar hasta homogeneizar.'],
  notas: ['TOTAL: 20,00 L — 16,27 kg aprox.', ...notas],
});

const sanitizanteNS = (tam, aroma) => {
  const es125 = tam === 125;
  const componentes = [
    { nombre: 'Alcohol de cereal / cleanser', medida: '14,50 L', kg: 11.46, insumo: I.ALCOHOL_SANITIZANTE },
    { nombre: 'Agua desionizada', medida: '5,00 L', kg: 5.0, insumo: I.AGUA },
    es125
      ? { nombre: 'Glicerina', medida: '0,13 L', kg: 0.17, pesoTexto: '0,17 kg aprox. (165 gr)', insumo: I.GLICERINA }
      : { nombre: 'Glicerina', medida: '0,13 L', kg: 0.16, pesoTexto: '0,16 kg aprox. (165 gr)', insumo: I.GLICERINA },
    ...(es125
      ? [{ nombre: 'Extracto glicolico de aloe vera', medida: '0,10 L', kg: 0.11, pesoTexto: '0,11 kg aprox. (110 gr)', insumo: I.ALOE_GLICOLICO }]
      : []),
    { nombre: `Fragancia ${aroma}`, medida: '0,20 L', kg: 0.2, pesoTexto: es125 ? '0,20 kg (200 gr)' : '0,20 kg aprox. (200 gr)', insumo: I.FRAGANCIA[aroma] },
    es125
      ? { nombre: `Pigmento ${aroma === 'AMOR' ? 'ROSA OSCURO #148' : aroma === 'AIRE' ? 'CAMALEON LILA #328' : 'VIOLETA #158 XVII'}`, medida: '0,01 L', kg: 0.006, pesoTexto: '0,006 kg aprox. (6 gr)', insumo: I.PIGMENTO_AROMA[aroma] }
      : { nombre: 'Pigmento / colorante', medida: 'Segun aroma', pesoTexto: 'Segun aroma' },
  ];
  const pasosBase = es125
    ? [
        'Agregar primero el AGUA.',
        'Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.',
        'Mezclar el EXTRACTO DE ALOE con un chorrito de PROPILENGLICOL en el ENVASE BLANCO con tapa negra (aloe + propilenglicol) y luego incorporarlo.',
        'Agregar el ALCOHOL.',
        'Pasar a la OLLA.',
        'En la olla agregar ESENCIA + COLORANTE / PIGMENTO segun el aroma (ver abajo).',
      ]
    : [
        'Agregar primero el AGUA.',
        'Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.',
        'Agregar el ALCOHOL.',
        'Pasar la mezcla a la OLLA.',
        'En la olla agregar la ESENCIA y despues el COLORANTE / PIGMENTO segun el aroma (ver abajo).',
      ];
  return {
    titulo: `SANITIZANTE NAIL SHOW ${tam} ml ${aroma} - BIDON DE 20 L`,
    pagina: es125 ? 4 : 3,
    componentes,
    pasos: pasosBase,
    notas: [
      ...(es125 ? ['RENDIMIENTO: 160 unidades de 125 ml por bidon.'] : []),
      'IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.',
      '',
      `AROMA ${aroma} (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:`,
      numerar(AROMA_PASOS[aroma]),
    ],
  };
};

const polimero = (titulo, pagina, pasos) => ({
  titulo,
  pagina,
  componentes: [],
  pasos,
  notas: [
    'MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.',
    'Probar y dejar muestra en el libro de muestras cuando corresponda.',
    'Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.',
  ],
});

const baseClear = '12 kg de Polimero Clear';
const ez8 = '8 baldes de EZ Flow de Clear';

const NAIL_SHOW = [
  {
    skus: ['377'],
    f: prep('NAIL SHOW', 2),
    nota377: true,
  },
  {
    skus: ['384', '385', '386'],
    f: {
      titulo: 'CLARIFICADOR NAIL SHOW - BIDON DE 20 L',
      pagina: 2,
      componentes: [
        { nombre: 'Alcohol comun / cereal', medida: '15,96 L', kg: 12.59, pesoTexto: '12,59 kg aprox.', insumo: I.ALCOHOL_CEREAL },
        { nombre: 'Alcohol isopropilico', medida: '4,00 L', kg: 3.14, pesoTexto: '3,14 kg aprox.', insumo: I.ISOPROPILICO },
        { nombre: 'Esencia Chicle Tutti Bazook', medida: '40 ml por bidon de 20 L', kg: 0.04, pesoTexto: '0,040 kg aprox.', insumo: I.TUTTI_BAZOOK },
      ],
      pasos: [
        'Agregar el ALCOHOL COMUN / CEREAL.',
        'Agregar el ALCOHOL ISOPROPILICO.',
        'Preparar 2 bidones de 20 L y pasarlos a la OLLA de 40 L.',
        'En la olla agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK en total (40 ml por cada bidon de 20 L).',
        'Mezclar hasta homogeneizar.',
      ],
      notas: ['IMPORTANTE - OLLA DE 40 L: son 2 bidones de 20 L. Agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK EN TOTAL en la olla.'],
    },
  },
  {
    skus: ['192'],
    f: {
      titulo: 'REMOVEDOR NAIL SHOW - BIDON AZUL DE 60 L',
      pagina: 2,
      componentes: [
        { nombre: 'Acetona', medida: '60,00 L', pesoTexto: '60 L de acetona' },
        { nombre: 'Aloe Vera Tintura', medida: '90 ml', pesoTexto: 'Medir 90 ml' },
        { nombre: 'Enmascarante', medida: '85 ml', pesoTexto: 'Medir 85 ml' },
      ],
      pasos: [
        'Preparar directamente en el BIDON AZUL DE 60 L.',
        'Agregar 60 LITROS DE ACETONA.',
        'Agregar 90 ml de ALOE VERA TINTURA.',
        'Agregar 85 ml de ENMASCARANTE.',
        'Mezclar hasta homogeneizar.',
      ],
      notas: [
        'FORMULA CONFIRMADA: 60 L de ACETONA + 90 ml de ALOE VERA TINTURA + 85 ml de ENMASCARANTE.',
        'Los dos aditivos se miden en ml; no convertir a kg sin densidad confirmada.',
      ],
    },
  },
  ...['AMOR', 'AIRE', 'PAZ'].map((a) => ({ skus: [{ AMOR: '391', AIRE: '393', PAZ: '395' }[a]], f: sanitizanteNS(200, a) })),
  ...['AMOR', 'AIRE', 'PAZ'].map((a) => ({ skus: [{ AMOR: '392', AIRE: '394', PAZ: '396' }[a]], f: sanitizanteNS(125, a) })),
  {
    skus: ['86', '99'],
    f: polimero('SOFT COVER PINK', 6, [
      baseClear,
      'Mezclar previamente en un tarrito: 1 y 1/2 cucharada (blanca) filtrada de Ferrite + 8 cucharadas (blancas) filtradas de Blanco Saturado.',
      'Batir durante 20 minutos.',
      'Probar el color y dejar una muestra en el libro de muestras.',
    ]),
  },
  {
    skus: ['87', '100'],
    f: polimero('DARK COVER PINK', 6, [
      baseClear,
      'Mezclar previamente en un tarrito: 6 cucharadas filtradas de Ferrite + 14 cucharadas filtradas de Blanco Saturado.',
      'Batir durante 20 minutos.',
      'Probar el color y dejar una muestra en el libro de muestras.',
    ]),
  },
  {
    skus: ['85', '98'],
    f: polimero('SHOW COVER PINK', 7, [
      baseClear,
      'Mezclar previamente en un tarrito: 6 cucharadas (blancas) filtradas de Ferrite + 14 cucharadas (blancas) filtradas de Blanco Saturado.',
      'Agregar 20 cucharadas blancas de Sugar XL Dorado.',
      'Batir durante 20 minutos.',
      'Probar el color y dejar una muestra en el libro de muestras.',
    ]),
  },
  {
    skus: ['83', '96'],
    f: polimero('BLANCO FRENCH', 8, [
      baseClear,
      'Agregar 1 balde entero de EZ Flow de Blanco Saturado, previamente filtrado.',
      'Batir durante 20 minutos.',
      'Probar el color y dejar una muestra en el libro de muestras.',
    ]),
  },
  {
    skus: ['80'],
    f: polimero('ROSADO TRANSLUCIDO', 8, [baseClear, 'Agregar 1 cucharada blanca de pigmento rosa #144 III.']),
  },
  {
    skus: ['88'],
    f: polimero('PINKY COVER PINK', 8, [
      ez8,
      'Agregar 4 cucharadas (blancas) filtradas de Blanco Saturado.',
      'Agregar 12 cucharadas mini de Ferrite.',
      'Agregar 10 cucharadas mini de pigmento rosa #144 III.',
    ]),
  },
  {
    skus: ['91'],
    f: polimero('PRINCESS', 8, [ez8, 'Agregar 8 cucharadas mini de Ferrite.', 'Agregar 12 cucharadas blancas de Sugar XLI Rainbow.']),
  },
  {
    skus: ['90'],
    f: polimero('DIAMONDS', 9, [
      ez8,
      'Agregar 4 cucharadas blancas de Glitter Plata Comun.',
      'Agregar 6 cucharadas blancas de Blanco Perlado #143 II.',
      'Agregar 20 cucharadas mini de Ferrite.',
      'Agregar 2 cucharadas mini de pigmento rosa #144 III.',
    ]),
  },
  {
    skus: ['89'],
    f: polimero('BEIGE COVER PINK - FORMULA ACTUALIZADA', 9, [
      ez8,
      'Agregar 18 cucharadas mini de pigmento verde oscuro #157 XVI.',
      'Agregar 50 cucharadas mini de Ferrite.',
      'Agregar 4 cucharadas blancas de Blanco Saturado.',
    ]),
  },
];

/* Vía Láctea: no hay SKU en el catálogo de productos. Va a pendientes. */
const VIA_LACTEA = polimero('VIA LACTEA', 7, [
  baseClear,
  'Agregar 6 cucharadas blancas, previamente filtradas, de Blanco Saturado.',
  'Batir durante 20 minutos.',
  'Probar el color y dejar una muestra en el libro de muestras.',
]);

const NAVI_NOTA = 'No confundir estas formulas con Nail Show o Glam.';
const TERCEROS = [
  {
    tercero: 'Navi',
    productos: [
      { nombre: 'PREP NAVI 8ml', f: prep('NAVI', 10, ['RENDIMIENTO ORIENTATIVO: 20 L = 2.500 envases de PREP de 8 ml.', NAVI_NOTA]) },
      {
        nombre: 'CLARIFICADOR NAVI',
        f: {
          titulo: 'CLARIFICADOR NAVI - BIDON DE 20 L',
          pagina: 10,
          componentes: [
            { nombre: 'Alcohol comun / cereal', medida: '15,96 L', kg: 12.59, insumo: I.ALCOHOL_CEREAL },
            { nombre: 'Alcohol isopropilico', medida: '4,00 L', kg: 3.14, insumo: I.ISOPROPILICO },
            { nombre: 'Chicle Pumita', medida: '25 ml', kg: 0.025, pesoTexto: '0,025 kg aprox.', insumo: I.CHICLE_PUMITA },
            { nombre: 'Frambuesa', medida: '12,5 ml', kg: 0.013, pesoTexto: '0,013 kg aprox.', insumo: I.FRAMBUESA },
          ],
          pasos: ['Agregar alcohol comun / cereal.', 'Agregar alcohol isopropilico.', 'Agregar Chicle Pumita y Frambuesa al final.', 'Mezclar hasta homogeneizar.'],
          notas: [NAVI_NOTA],
        },
      },
      {
        nombre: 'POLYGEL NAVI',
        f: {
          titulo: 'POLYGEL NAVI - BIDON DE 60 L',
          pagina: 10,
          componentes: [
            { nombre: 'Alcohol isopropilico', medida: '42,48 L', kg: 33.35, insumo: I.ISOPROPILICO },
            { nombre: 'Acetato de butilo', medida: '15,00 L', kg: 13.2, insumo: I.ACETATO_BUTILO },
            { nombre: 'Glicerina', medida: '2,40 L', kg: 3.02, insumo: I.GLICERINA },
            { nombre: 'Chicle Pumita', medida: '80 ml', kg: 0.08, pesoTexto: '0,080 kg aprox.', insumo: I.CHICLE_PUMITA },
            { nombre: 'Frambuesa', medida: '40 ml', kg: 0.042, pesoTexto: '0,042 kg aprox.', insumo: I.FRAMBUESA },
          ],
          pasos: [
            'Agregar primero el alcohol isopropilico.',
            'Agregar la glicerina.',
            'Agregar el acetato de butilo.',
            'Agregar Chicle Pumita + Frambuesa al final.',
            'Mezclar hasta homogeneizar.',
          ],
          notas: [NAVI_NOTA],
        },
      },
      {
        nombre: 'REMOVEDOR DE ESMALTE NAVI 250ml',
        f: {
          titulo: 'REMOVEDOR DE ESMALTE NAVI - OLLA DE 40 L',
          pagina: 11,
          componentes: [
            { nombre: 'Removedor base', medida: '20,00 L', kg: 20.0, pesoTexto: '20,00 kg aprox.' },
            { nombre: 'Alcohol comun / cereal', medida: '20,00 L', kg: 15.78, pesoTexto: '15,78 kg aprox.', insumo: I.ALCOHOL_CEREAL },
            { nombre: 'Chicle Pumita', medida: '50 ml', kg: 0.05, pesoTexto: '0,050 kg aprox.', insumo: I.CHICLE_PUMITA },
            { nombre: 'Frambuesa', medida: '25 ml', kg: 0.026, pesoTexto: '0,026 kg aprox.', insumo: I.FRAMBUESA },
          ],
          pasos: ['Agregar el removedor base y el alcohol comun / cereal en la OLLA DE 40 L.', 'Agregar Chicle Pumita y Frambuesa.', 'Mezclar hasta homogeneizar.'],
          notas: [
            'RECIPIENTE: OLLA DE 40 L. Rendimiento aproximado: 160 envases de 250 ml.',
            'El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.',
          ],
        },
      },
      {
        nombre: 'REMOVEDOR DE UÑAS ARTIFICIALES NAVI 250ml',
        f: {
          titulo: 'REMOVEDOR DE UÑAS ARTIFICIALES NAVI - BIDON AZUL DE 60 L',
          pagina: 11,
          componentes: [
            { nombre: 'Removedor base', medida: '3 bidones de 20 L', kg: 60.0, pesoTexto: '60,00 kg aprox.' },
            { nombre: 'Chicle Pumita', medida: '75 ml', kg: 0.075, pesoTexto: '0,075 kg aprox.', insumo: I.CHICLE_PUMITA },
            { nombre: 'Frambuesa', medida: '37,5 ml', kg: 0.04, pesoTexto: '0,040 kg aprox.', insumo: I.FRAMBUESA },
          ],
          pasos: ['Preparar directamente en el BIDON AZUL DE 60 L.', 'Agregar los 3 bidones de 20 L de removedor base.', 'Agregar Chicle Pumita y Frambuesa.', 'Mezclar hasta homogeneizar.'],
          notas: [
            'Rendimiento aproximado: 240 envases de 250 ml.',
            'El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.',
          ],
        },
      },
    ],
  },
  {
    tercero: 'Glam',
    color: 'pink',
    productos: [
      {
        nombre: 'SANITIZANTE LIMON GLAM',
        f: {
          titulo: 'SANITIZANTE LIMON GLAM - OLLA DE 40 L (y BIDON GRANDE DE 200 L)',
          pagina: 12,
          componentes: [
            { nombre: 'Alcohol comun / cereal', medida: '29,00 L', kg: 22.88, pesoTexto: '22,88 kg aprox.', insumo: I.ALCOHOL_SANITIZANTE },
            { nombre: 'Agua desionizada', medida: '10,00 L', kg: 10.0, insumo: I.AGUA },
            { nombre: 'Glicerina', medida: '260 ml', kg: 0.33, pesoTexto: '0,33 kg aprox.', insumo: I.GLICERINA },
            { nombre: 'Esencia Limon', medida: '75 ml', kg: 0.075, pesoTexto: '0,075 kg aprox.' },
            { nombre: 'Colorante amarillo', medida: '2 cucharadas de 1/8 tsp', pesoTexto: 'Medir con cuchara 1/8' },
          ],
          pasos: [
            'Agregar primero el AGUA.',
            'Mezclar la GLICERINA con un chorrito de agua e incorporar.',
            'Agregar el ALCOHOL.',
            'Pasar a la OLLA.',
            'En la olla agregar 75 ml de esencia LIMON.',
            'Agregar 2 cucharadas de 1/8 tsp de colorante AMARILLO.',
          ],
          notas: [
            'Aroma/color del sanitizante: LIMON + AMARILLO. Usar la cuchara 1/8 tsp para el colorante amarillo.',
            '',
            'TANDA EN BIDON GRANDE DE 200 L (mismas proporciones):',
            '  - Alcohol comun / cereal: 145 L — 114,41 kg aprox.',
            '  - Agua desionizada: 50 L — 50,00 kg',
            '  - Glicerina: 1,30 L — 1,64 kg aprox.',
            '  - Esencia Limon: 375 ml — 0,375 kg aprox.',
            '  - Colorante amarillo: 10 cucharadas de 1/8 tsp',
            'Orden en 200 L: AGUA; GLICERINA con un chorrito de agua; ALCOHOL; 375 ml de esencia LIMON; 10 cucharadas de 1/8 tsp de colorante AMARILLO.',
          ],
        },
      },
      {
        nombre: 'CLARIFICADOR GLAM',
        f: {
          titulo: 'CLARIFICADOR GLAM - BIDON DE 20 L',
          pagina: 13,
          componentes: [
            { nombre: 'Alcohol comun / cereal', medida: '15,85 L aprox.', kg: 12.5, pesoTexto: '12,50 kg aprox.', insumo: I.ALCOHOL_CEREAL },
            { nombre: 'Alcohol isopropilico', medida: '4,00 L', kg: 3.14, insumo: I.ISOPROPILICO },
            { nombre: 'Esencia Frutilla', medida: '150 ml', kg: 0.15, pesoTexto: '0,150 kg aprox.' },
            { nombre: 'Colorante rojo', medida: 'Ajustar visualmente', pesoTexto: 'Agregar de a poco' },
          ],
          pasos: ['Agregar el alcohol comun / cereal.', 'Agregar el alcohol isopropilico.', 'Agregar la esencia FRUTILLA.', 'Agregar el colorante rojo de a poco, ajustando visualmente.'],
          notas: [
            'ESENCIA CONFIRMADA: FRUTILLA - 150 ml (aprox. 0,150 kg) por cada 20 L.',
            'El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.',
          ],
        },
      },
      {
        nombre: 'POLYGEL GLAM',
        f: {
          titulo: 'POLYGEL GLAM - REFERENCIA DE TANDA DE 60 L',
          pagina: 13,
          componentes: [
            { nombre: 'Base de Polygel Glam', medida: '60 L de liquido preparado', pesoTexto: 'Segun formula operativa vigente' },
            { nombre: 'Esencia Anana', medida: '200 ml', pesoTexto: '0,200 kg aprox.' },
            { nombre: 'Colorante azul', medida: '1 cucharada de 2,5 ml', pesoTexto: 'Medir con cuchara 2,5 ml' },
          ],
          pasos: ['Preparar los 60 L de base de Polygel Glam.', 'Agregar 200 ml de esencia ANANA.', 'Agregar 1 cucharada de 2,5 ml de colorante AZUL.'],
          notas: [
            'REFERENCIA CONFIRMADA EN PRODUCCION: 60 L + 200 ml de ANANA + 1 cucharada de 2,5 ml de colorante AZUL.',
            'La base de Polygel Glam no esta en el manual ("segun formula operativa vigente"): sin ella no hay % p/p. No asumir la base de otra marca.',
          ],
        },
      },
    ],
  },
  {
    tercero: 'Jennifer Beauty',
    color: 'indigo',
    productos: ['MANGO / DURAZNO', 'FRUTOS ROJOS', 'COCO / VAINILLA'].flatMap((aroma) => [
      {
        nombre: `CREMA HUMECTANTE JENNIFER BEAUTY 200g ${aroma}`,
        variedad: aroma,
        f: crema('HUMECTANTE', aroma),
        esencia: { pct: 0.6, nombre: `Esencia ${aroma}` },
        base: 'Base de crema humectante (no especificada en el manual)',
      },
      {
        nombre: `CREMA EXFOLIANTE JENNIFER BEAUTY 200g ${aroma}`,
        variedad: aroma,
        f: crema('EXFOLIANTE', aroma),
        esencia: { pct: 0.6, nombre: `Esencia ${aroma}` },
        base: 'Base de crema exfoliante (no especificada en el manual)',
      },
      {
        nombre: `SANITIZANTE JENNIFER BEAUTY 100ml ${aroma}`,
        variedad: aroma,
        f: {
          titulo: `SANITIZANTE JENNIFER BEAUTY 100 ml ${aroma} - REFERENCIA POR 20 L`,
          pagina: 14,
          componentes: [
            { nombre: 'Alcohol de cereal / cleanser', medida: '14,50 L', kg: 11.46, insumo: I.ALCOHOL_SANITIZANTE },
            { nombre: 'Agua desionizada', medida: '5,00 L', kg: 5.0, insumo: I.AGUA },
            { nombre: 'Glicerina', medida: '0,13 L', kg: 0.16, pesoTexto: '0,16 kg aprox.', insumo: I.GLICERINA },
            { nombre: `Esencia ${aroma}`, medida: '200 g por 20 L', kg: 0.2, pesoTexto: '0,200 kg' },
            { nombre: 'Colorante', medida: 'Segun variante', pesoTexto: 'Segun variante' },
          ],
          pasos: ['Agregar primero el AGUA.', 'Mezclar la GLICERINA con un chorrito de agua e incorporar.', 'Agregar el ALCOHOL.', 'Agregar la ESENCIA y el colorante de la variante.'],
          notas: [`PEDIDO DE REFERENCIA: 500 unidades x 100 ml = 50 L — esencia necesaria 0,500 kg (${aroma}).`],
        },
      },
      {
        nombre: `ACEITE DE CUTICULA JENNIFER BEAUTY 30ml ${aroma}`,
        variedad: aroma,
        f: {
          titulo: `ACEITE DE CUTICULA JENNIFER BEAUTY 30 ml ${aroma}`,
          pagina: 15,
          componentes: [],
          pasos: ['Preparar la base del aceite de cuticula.', 'Agregar la esencia al 0,80 %.', 'Mezclar hasta homogeneizar.'],
          notas: [
            `PEDIDO DE REFERENCIA: 500 unidades x 30 ml = 15 L — esencia al 0,80 %: 0,120 kg aprox. (${aroma}).`,
            'La dosificacion confirmada de esencia es 0,80 %. La formula/base completa del aceite no fue especificada en este manual.',
          ],
        },
        esencia: { pct: 0.8, nombre: `Esencia ${aroma}` },
        base: 'Base de aceite de cuticula (no especificada en el manual)',
      },
    ]),
  },
];

function crema(tipo, aroma) {
  return {
    titulo: `CREMA ${tipo} JENNIFER BEAUTY 200 g ${aroma}`,
    pagina: 14,
    componentes: [
      { nombre: `Crema ${tipo.toLowerCase()} a producir`, medida: '100 kg', pesoTexto: '100 kg' },
      { nombre: `Esencia ${aroma} (0,6 %)`, medida: '0,6 %', pesoTexto: '0,600 kg — PESAR EN KG' },
    ],
    pasos: [`Pesar la base de crema ${tipo.toLowerCase()}.`, 'Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.', 'Mezclar hasta homogeneizar.'],
    notas: [
      `TOTAL ${tipo}: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.`,
      'La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.',
    ],
  };
}

/* ------------------------------------------------------------------------- *
 * Componentes con %: los que tienen kg, el más pesado como csp.
 * ------------------------------------------------------------------------- */

function componentesConPct(f, extra) {
  // Jennifer Beauty cremas y aceite: la esencia es un % fijo y la base csp.
  if (extra?.esencia) {
    return [
      { orden: 1, nombre: extra.base, csp: true, obs: 'Base no especificada en el manual: completar antes de aprobar.' },
      { orden: 2, nombre: extra.esencia.nombre, pct: extra.esencia.pct, obs: `Manual: esencia al ${coma(extra.esencia.pct)} %.` },
    ];
  }
  const conKg = f.componentes.filter((c) => c.kg !== undefined);
  if (conKg.length === 0) return [];
  const total = conKg.reduce((a, c) => a + c.kg, 0);
  const csp = conKg.reduce((a, c) => (c.kg > a.kg ? c : a));
  return conKg.map((c, i) => ({
    orden: i + 1,
    insumo: c.insumo,
    nombre: c.insumo ? null : c.nombre,
    csp: c === csp,
    pct: c === csp ? null : Math.round((c.kg / total) * 1e6) / 1e4,
    obs: `Manual: ${c.medida} — ${c.pesoTexto ?? `${coma(c.kg)} kg`} por tanda (${coma(Math.round(total * 1000) / 1000)} kg pesados en total).`,
  }));
}

/* ------------------------------------------------------------------------- *
 * SQL
 * ------------------------------------------------------------------------- */

const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const dolar = (s) => {
  if (s.includes('$txt$')) throw new Error('El texto contiene $txt$');
  return `$txt$${s}$txt$`;
};

function sqlFormula(productoExpr, f, extra) {
  const comps = componentesConPct(f, extra);
  const lineas = [];
  lineas.push(`  v_prod := ${productoExpr};`);
  // Un borrador vacío (sin componentes ni procedimiento, p. ej. el de la 394
  // cargado desde la app) se completa en vez de duplicarse; si no, versión nueva.
  lineas.push(`  v_f := null;`);
  lineas.push(`  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'`);
  lineas.push(`     and f.variedad is not distinct from ${lit(extra?.variedad ?? null)}`);
  lineas.push(`     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)`);
  lineas.push(`     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)`);
  lineas.push(`   order by f.creado_en limit 1;`);
  lineas.push(`  if v_f is null then`);
  lineas.push(`    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)`);
  lineas.push(`    values (v_prod, ${lit(extra?.variedad ?? null)}, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)`);
  lineas.push(`    returning id into v_f;`);
  lineas.push(`  end if;`);
  for (const c of comps) {
    const insumo = c.insumo ? `pg_temp.insumo(${lit(c.insumo)})` : 'null';
    lineas.push(
      `  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, ${c.orden}, ${insumo}, ${lit(c.nombre)}, ${c.csp ? 'null' : c.pct}, ${Boolean(c.csp)}, ${lit(c.obs)});`,
    );
  }
  lineas.push(`  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, ${dolar(procedimiento(f))}, v_dt);`);
  return lineas.join('\n');
}

const bloques = [];
let nFormulas = 0;
for (const g of NAIL_SHOW) {
  for (const sku of g.skus) {
    bloques.push(`  -- ${sku}: ${g.f.titulo}`);
    bloques.push(sqlFormula(`pg_temp.producto(${lit(sku)})`, g.f, null));
    nFormulas++;
  }
}
const altas = [];
for (const t of TERCEROS) {
  const var_ = `v_t_${t.tercero.toLowerCase().replace(/\W+/g, '_')}`;
  // El que ya existe se usa (Navi se dio de alta desde la app); si no, se crea.
  altas.push(
    `  select id into ${var_} from gmp.terceros where nombre = ${lit(t.tercero)} and activo;\n` +
      `  if ${var_} is null then\n` +
      `    insert into gmp.terceros (nombre, color, observaciones, creado_por) values (${lit(t.tercero)}, ${lit(t.color ?? 'teal')}, ${lit(`Alta con la carga del ${ORIGEN}.`)}, v_dt) returning id into ${var_};\n` +
      `  end if;`,
  );
  for (const p of t.productos) {
    bloques.push(`  -- ${t.tercero}: ${p.nombre}`);
    bloques.push(sqlFormula(`(gmp.alta_producto_tercero(${var_}, ${lit(p.nombre)}, null, ${lit(p.variedad ?? null)})).id`, p.f, p));
    nFormulas++;
  }
}
const varsTerceros = TERCEROS.map((t) => `  v_t_${t.tercero.toLowerCase().replace(/\W+/g, '_')} uuid;`).join('\n');
const nProductosNuevos = TERCEROS.reduce((a, t) => a + t.productos.length, 0);

const sql = `-- ---------------------------------------------------------------------------
-- Propósito : Carga del manual de fórmulas de producción v10: ${nFormulas} fórmulas en
--             BORRADOR, cada una con su procedimiento (texto del manual) y los
--             componentes con % p/p donde el manual da el peso en kg. Alta de
--             los clientes tercerizados Glam y Jennifer Beauty y de ${nProductosNuevos}
--             productos tercerizados (Navi, Glam, Jennifer Beauty).
-- Reglas    : §4.6 del alcance (fórmula maestra, aprobación DT), ítem 3 de la
--             cola del 2026-09-24 (procedimiento por fórmula), RN-50.
-- Origen    : ${ORIGEN}, sha256 ${SHA256}.
--             Generada por scripts/manual_formulas/generar_migracion.mjs; lo
--             que no entró está en scripts/manual_formulas/pendientes.md.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- TODO QUEDA EN BORRADOR. Una fórmula la aprueba Dirección Técnica: la carga
-- no la hace vigente. La 377 (PREP) tiene una v1 VIGENTE en 70/30 % p/p; el
-- manual da 70/30 en VOLUMEN (14 L + 6 L), que en masa es 67,55/32,45
-- (10,99 + 5,28 kg). Se carga como v2 en borrador para que la DT decida.
--
-- % P/P. Se calcula sobre lo que el manual pesa en kg por tanda; el
-- componente más pesado es csp. Cucharadas, «según aroma» y ml sin densidad
-- no entran a la tabla de la fórmula: quedan en el procedimiento, que es el
-- texto del manual. Los polímeros y el removedor de Nail Show quedan sin
-- componentes hasta pesar las cucharadas / confirmar densidades.
--
-- AUTORÍA. \`db push\` corre sin sesión de usuario: se registra como autora a
-- la Dirección Técnica activa (titular si existe), como en las cargas de
-- saldo de apertura y de precios: es quien autoriza la carga.

create function pg_temp.insumo(p_codigo text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from gmp.insumos_catalogo where codigo_interno = p_codigo;
  if v is null then raise exception 'No está el insumo % en el catálogo.', p_codigo; end if;
  return v;
end;
$$;

create function pg_temp.producto(p_codigo text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from gmp.productos where codigo_interno = p_codigo and tercero_id is null;
  if v is null then raise exception 'No está el producto % en el catálogo.', p_codigo; end if;
  return v;
end;
$$;

do $carga$
declare
  v_dt   uuid;
  v_prod uuid;
  v_f    uuid;
${varsTerceros}
begin
  select id into v_dt from core.usuarios
   where rol = 'DIRECCION_TECNICA' and activo
   order by es_dt_titular desc, creado_en
   limit 1;
  if v_dt is null then
    raise exception 'No hay Dirección Técnica activa: la carga de fórmulas necesita un responsable identificado.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA')::text, true);

${altas.join('\n')}

${bloques.join('\n\n')}
end;
$carga$;
`;

writeFileSync(MIGRACION, sql);

/* ------------------------------------------------------------------------- *
 * Pendientes
 * ------------------------------------------------------------------------- */

const sinInsumo = new Set();
const sinPct = [];
for (const g of [...NAIL_SHOW.map((x) => ({ n: x.f.titulo, f: x.f })), ...TERCEROS.flatMap((t) => t.productos.map((p) => ({ n: p.nombre, f: p.f, p })))]) {
  for (const c of g.f.componentes) {
    if (c.kg !== undefined && !c.insumo) sinInsumo.add(c.nombre);
    if (c.kg === undefined) sinPct.push(`${g.n}: ${c.nombre} (${c.medida})`);
  }
  if (g.p?.esencia) sinInsumo.add(g.p.esencia.nombre);
}

const md = `# Manual de fórmulas v10 — lo que no entró o hay que confirmar

Generado por \`generar_migracion.mjs\`. Origen: \`${ORIGEN}\` (sha256 \`${SHA256}\`).
${nFormulas} fórmulas cargadas en BORRADOR (${NAIL_SHOW.reduce((a, g) => a + g.skus.length, 0)} de Nail Show, ${nProductosNuevos} de terceros).

## Para la Dirección Técnica, antes de aprobar

1. **377 PREP 8ml**: la v1 vigente dice 70/30 % p/p. El manual da 70/30 en
   **volumen** (14 L + 6 L); en masa es **67,55 / 32,45** (10,99 + 5,28 kg). La
   v2 en borrador trae lo del manual.
2. **Glicerina del sanitizante Nail Show**: en el de 200 ml dice «0,16 kg aprox.
   (165 gr)», en el de 125 ml «0,17 kg aprox. (165 gr)». Se cargó el kg de cada
   uno; 165 g no coincide con ninguno.
3. **Alcohol de los sanitizantes** (Nail Show, Glam, Jennifer Beauty) cargado
   como \`135SAN ALCOHOL PARA SANITIZANTE\`; el de clarificadores y removedores
   como \`138CL1 ALCOHOL DE CEREAL (cleanser)\`. El manual dice «alcohol de
   cereal / cleanser» y «alcohol común / cereal» indistintamente: confirmar.
4. **Pigmento del sanitizante 125 ml**: la tabla dice «Pigmento 0,01 L — 0,006
   kg» sin nombre; se cargó como el pigmento del aroma (rosa oscuro #148, camaleón
   lila #328, violeta #158), que en la olla son 20 ml = 10 ml por bidón.
5. **Removedor de esmalte, removedor de uñas artificiales y clarificador Glam**:
   el manual no trae orden de preparación; el procedimiento sigue el orden de
   la tabla y lo avisa.
6. **Bases no especificadas**: cremas y aceite de Jennifer Beauty, Polygel Glam.
   Sus fórmulas tienen la base como csp por nombre, sin composición.

## Insumos que no están en el catálogo (cargados por nombre)

${[...sinInsumo].sort().map((n) => `- ${n}`).join('\n')}

Darlos de alta en \`/insumos\` y reemplazar el nombre por el insumo en cada
fórmula antes de aprobarla: con nombre libre no se descuenta stock.

## Cantidades sin % p/p (solo en el procedimiento)

Cucharadas sin peso confirmado, «según aroma» y ml sin densidad. Para pasarlas
a la fórmula hay que pesar una cucharada blanca, una mini, una de 2,5 ml y una
de 1/8 tsp de cada material.

${sinPct.map((n) => `- ${n}`).join('\n')}

## Sin SKU

- **VÍA LÁCTEA** (pág. 7): no hay producto con ese nombre. Procedimiento:

\`\`\`
${procedimiento(VIA_LACTEA)}
\`\`\`

- Sanitizantes sin aroma (\`135\` con gatillo 200 ml, \`320\` sin gatillo 200 ml,
  \`335\` 1 L): el manual los formula por aroma; no se les cargó fórmula.
- \`136\` y \`138\` («no se usa»), \`109\` (gel de construcción, no polímero) y
  los PACK: sin fórmula.
`;
writeFileSync(join(AQUI, 'pendientes.md'), md);

console.log(`${nFormulas} fórmulas, ${nProductosNuevos} productos nuevos → ${MIGRACION}`);
