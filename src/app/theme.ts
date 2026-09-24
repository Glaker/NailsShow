import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * Tema del sistema de trazabilidad.
 *
 * Guía de origen: CLAUDE.md §6, convenciones de frontend.
 *   «Interfaz densa en información, pensada para uso en planta con guantes y en
 *    tablet: áreas de toque grandes, contraste alto, nada de animaciones
 *    decorativas.»
 *
 * Las tres consecuencias concretas de esa guía, y cómo se materializan acá:
 *
 *  1. Guantes  → el dedo pierde precisión. Todo control interactivo mide al
 *     menos ALTURA_TACTIL_MIN (44 px). Se resuelve con `sizes` de cada
 *     componente, no con padding suelto en cada pantalla.
 *  2. Tablet en planta → pantalla mediana, luz variable, a veces con película
 *     protectora. Se prioriza contraste y peso de tipografía sobre sutileza.
 *  3. Densidad de información → los espaciados son compactos, para que entren
 *     más filas por pantalla. La densidad se gana en el espaciado *entre*
 *     elementos, nunca achicando el área de toque.
 *
 * Sobre el movimiento. La fase 0 prohibía toda animación: en planta el
 * movimiento es ruido, y en un registro BPF un elemento que se mueve solo puede
 * confundirse con una respuesta del sistema que no ocurrió. La conducción del
 * proyecto revisó ese criterio y pidió transiciones suaves, sin apariciones
 * bruscas. Queda así:
 *
 *   - Sí: transiciones de estado de un elemento que ya está en pantalla
 *     (hover, foco, apertura de panel, entrada de una tarjeta). Cortas,
 *     DURACION_TRANSICION, con curva de salida.
 *   - No: nada que se mueva solo, parpadee, o que llame la atención sobre algo
 *     que el usuario no tocó. Ninguna animación puede sugerir que un registro
 *     se guardó, se firmó o cambió de estado: eso lo dice el texto.
 *   - `respectReducedMotion` sigue en true, así que quien tenga reducción de
 *     movimiento configurada en su sistema no ve ninguna de las dos cosas.
 */

/** Área de toque mínima con guantes, en píxeles. */
const ALTURA_TACTIL_MIN = 44;

/** Duración de toda transición de la interfaz, en milisegundos. */
export const DURACION_TRANSICION = 160;

/** Curva de salida: arranca rápido y frena. Nunca rebota. */
export const CURVA_TRANSICION = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/* ------------------------------------------------------------------------- *
 * Colores de estado de rótulo — I.20.2
 * ------------------------------------------------------------------------- *
 *
 * I.20.2 define cuatro estados de rótulo con cuatro colores:
 *
 *   EN CUARENTENA → amarillo
 *   EN ANÁLISIS   → gris
 *   APROBADO      → verde
 *   RECHAZADO     → rojo
 *
 * Estos cuatro colores están RESERVADOS. Ningún elemento decorativo, de marca
 * ni de navegación puede usarlos: en planta, el color es el que comunica el
 * estado del material, y un acento verde en un botón cualquiera degrada esa
 * señal.
 *
 * Se declaran como colores nombrados del tema (`estadoCuarentena`,
 * `estadoEnAnalisis`, `estadoAprobado`, `estadoRechazado`) para que las
 * pantallas los consuman por nombre — `c="estadoAprobado.7"` — sin hardcodear
 * hexadecimales en los componentes de rótulo.
 *
 * Nota documental que conviene no perder: I.20.1 paso 8 dice ROJO para
 * cuarentena, en contradicción con I.20.2. Prevalece I.20.2, que es el POE
 * específico de rotulado y coincide con los registros R.20.2.1 v01 y con
 * I.20.5 v03. Ver inconsistencia 1 de §10 del documento de alcance. La regla
 * RN-04 se implementa en la base como función determinista y columna generada
 * (`gmp.color_rotulo`); esta paleta es solamente su representación visual.
 */

const estadoCuarentena: MantineColorsTuple = [
  '#fff9db',
  '#fff3bf',
  '#ffec99',
  '#ffe066',
  '#ffd43b',
  '#fcc419',
  '#fab005',
  '#f59f00',
  '#f08c00',
  '#e67700',
];

const estadoEnAnalisis: MantineColorsTuple = [
  '#f8f9fa',
  '#f1f3f5',
  '#e9ecef',
  '#dee2e6',
  '#ced4da',
  '#adb5bd',
  '#868e96',
  '#495057',
  '#343a40',
  '#212529',
];

const estadoAprobado: MantineColorsTuple = [
  '#ebfbee',
  '#d3f9d8',
  '#b2f2bb',
  '#8ce99a',
  '#69db7c',
  '#51cf66',
  '#40c057',
  '#37b24d',
  '#2f9e44',
  '#2b8a3e',
];

const estadoRechazado: MantineColorsTuple = [
  '#fff5f5',
  '#ffe3e3',
  '#ffc9c9',
  '#ffa8a8',
  '#ff8787',
  '#ff6b6b',
  '#fa5252',
  '#f03e3e',
  '#e03131',
  '#c92a2a',
];

/* ------------------------------------------------------------------------- *
 * Color de interfaz
 * ------------------------------------------------------------------------- *
 *
 * Violeta orquídea. La elección es de identidad: el cliente fabrica cosmética
 * para uñas y su mundo visual es ése. La condición que tiene que cumplir
 * cualquier color de marca en este sistema es una sola, y la cumple: no
 * competir con ninguno de los cuatro colores reservados de I.20.2. Un violeta
 * no se confunde con amarillo, gris, verde ni rojo ni siquiera en una tablet
 * con película protectora y luz de galpón.
 *
 * (En la fase 0 este color era azul, por la misma condición. Cambió el color,
 * no el criterio.)
 */
const violeta: MantineColorsTuple = [
  '#fbf3fd',
  '#f2e4f7',
  '#e5c6ef',
  '#d6a5e6',
  '#c989de',
  '#c176d9',
  '#bd6cd7',
  '#a558bf',
  '#934dab',
  '#7f4096',
];

/**
 * Rosa de acento. Se usa con cuentagotas: gradiente de marca, un dato
 * destacado, el estado activo de la navegación. Nunca para comunicar estado de
 * material.
 */
const rosa: MantineColorsTuple = [
  '#ffeff6',
  '#fadce7',
  '#eeb7cc',
  '#e390b0',
  '#d96f98',
  '#d45a88',
  '#d34f80',
  '#bb3f6d',
  '#a83661',
  '#942b54',
];

/**
 * Ciruela: la escala oscura de la barra lateral y de las superficies de marca.
 * Va de la más oscura a la más clara para poder usarla como `ciruela.0` = fondo
 * de la barra, igual que se lee un fondo.
 */
const ciruela: MantineColorsTuple = [
  '#f7f2f8',
  '#e8dcec',
  '#c9b3d1',
  '#a888b5',
  '#8b679d',
  '#6d4a7f',
  '#523562',
  '#3a2447',
  '#281732',
  '#1a0e22',
];

/** Superficies y bordes de la aplicación, en un solo lugar. */
export const SUPERFICIE = {
  /** Fondo general de la aplicación. Blanco con una gota de violeta. */
  fondo: '#faf7fb',
  /** Fondo de tarjeta. */
  tarjeta: '#ffffff',
  /** Borde de tarjeta y de tabla. */
  borde: '#efe6f3',
  /** Fondo de la barra lateral. */
  barra: '#1a0e22',
  /** Fondo del ítem de navegación activo. */
  barraActiva: '#3a2447',
  /** Texto secundario dentro de la barra lateral. */
  barraTexto: '#c9b3d1',
} as const;

/**
 * Nombres de los colores de estado de rótulo, para consumo tipado desde las
 * pantallas. Mapear `estado_calidad_enum` contra esta constante evita que un
 * literal de color se filtre a un componente de rótulo.
 *
 * `RECIBIDO` y `MUESTREADO` no tienen color de rótulo en I.20.2 porque no
 * tienen rótulo: son estados internos del circuito. Se muestran en la escala
 * de interfaz, nunca en una de las cuatro reservadas.
 */
export const COLORES_ESTADO_ROTULO = {
  RECIBIDO: 'violeta',
  CUARENTENA: 'estadoCuarentena',
  MUESTREADO: 'violeta',
  EN_ANALISIS: 'estadoEnAnalisis',
  APROBADO: 'estadoAprobado',
  RECHAZADO: 'estadoRechazado',
  // Saldo de apertura: AZUL en gmp.color_rotulo() (20260916130000). No es un
  // color de I.20.2: es el distintivo de material sin lote identificado ni
  // control de calidad (ESPEC_SALDO_INICIAL §5.1). Azul de Mantine, que no
  // compite con los cuatro reservados.
  SALDO_APERTURA: 'blue',
} as const;

export type ColorEstadoRotulo =
  (typeof COLORES_ESTADO_ROTULO)[keyof typeof COLORES_ESTADO_ROTULO];

export const theme = createTheme({
  colors: {
    violeta,
    rosa,
    ciruela,
    estadoCuarentena,
    estadoEnAnalisis,
    estadoAprobado,
    estadoRechazado,
  },
  primaryColor: 'violeta',
  primaryShade: { light: 7, dark: 5 },

  fontSmoothing: true,
  defaultRadius: 'md',

  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',

  /*
   * Radio moderado. La fase 0 lo tenía casi en cero por densidad; la densidad
   * la dan el espaciado y el tamaño de fuente, no las esquinas. Un radio de 8
   * a 12 px separa mejor las tarjetas del fondo, que es lo que hace legible un
   * tablero con doce indicadores.
   */
  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(8),
    lg: rem(12),
    xl: rem(16),
  },

  /* Espaciado compacto. La densidad se gana acá, no achicando controles. */
  spacing: {
    xs: rem(6),
    sm: rem(10),
    md: rem(14),
    lg: rem(20),
    xl: rem(28),
  },

  /* Tipografía con cuerpo generoso: se lee a distancia de brazo, en tablet. */
  fontSizes: {
    xs: rem(12),
    sm: rem(13),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },
  lineHeights: {
    xs: '1.3',
    sm: '1.35',
    md: '1.45',
    lg: '1.45',
    xl: '1.5',
  },

  headings: {
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(26), lineHeight: '1.25' },
      h2: { fontSize: rem(21), lineHeight: '1.3' },
      h3: { fontSize: rem(17), lineHeight: '1.35' },
      h4: { fontSize: rem(15), lineHeight: '1.4' },
    },
  },

  /* Sombras cortas y de poco radio: con luz de planta, una sombra difusa no se ve. */
  shadows: {
    xs: '0 1px 2px rgba(40, 23, 50, 0.06)',
    sm: '0 1px 3px rgba(40, 23, 50, 0.08)',
    md: '0 2px 8px rgba(40, 23, 50, 0.08)',
    lg: '0 4px 16px rgba(40, 23, 50, 0.10)',
    xl: '0 8px 28px rgba(40, 23, 50, 0.12)',
  },

  /* Ver la nota sobre movimiento en el encabezado del archivo. */
  respectReducedMotion: true,
  cursorType: 'pointer',

  components: {
    /*
     * Tamaño 'md' por defecto en todo control de entrada, y altura mínima
     * táctil forzada. `size="md"` de Mantine ronda los 42 px; el `minHeight`
     * cierra la diferencia hasta los 44 px exigidos.
     */
    Button: {
      defaultProps: { size: 'md' },
      styles: { root: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    ActionIcon: {
      defaultProps: { size: 'lg' },
      styles: {
        root: { minHeight: rem(ALTURA_TACTIL_MIN), minWidth: rem(ALTURA_TACTIL_MIN) },
      },
    },
    TextInput: {
      defaultProps: { size: 'md' },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    PasswordInput: {
      defaultProps: { size: 'md' },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    /*
     * Coma decimal, como se escribe en planta («1,2»). Por defecto Mantine usa
     * el punto y descarta la coma: «1,2» quedaba en «1» o en «12». Se acepta
     * también el punto, porque el teclado numérico de la tablet lo trae. Sin
     * separador de miles: con coma y punto a la vez, «1.200» sería ambiguo.
     */
    NumberInput: {
      defaultProps: {
        size: 'md',
        decimalSeparator: ',',
        allowedDecimalSeparators: [',', '.'],
      },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    Textarea: {
      defaultProps: { size: 'md' },
    },
    Select: {
      defaultProps: { size: 'md' },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    MultiSelect: {
      defaultProps: { size: 'md' },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    DateInput: {
      defaultProps: { size: 'md' },
      styles: { input: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    /*
     * Checkbox y Radio son los controles de las verificaciones previas
     * bloqueantes (I.50.4 RN-10, I.40.16 RN-14 y RN-15). Se tocan con guante y
     * un error de tap tiene consecuencia registral: van en 'lg'.
     */
    Checkbox: {
      defaultProps: { size: 'md' },
    },
    Radio: {
      defaultProps: { size: 'md' },
    },
    Switch: {
      defaultProps: { size: 'md' },
    },
    /*
     * Tablas: espaciado compacto para densidad, pero las filas conservan la
     * altura táctil porque en varias pantallas la fila entera es el objetivo
     * de toque (seleccionar un lote, abrir un rótulo).
     */
    Table: {
      defaultProps: {
        horizontalSpacing: 'md',
        verticalSpacing: 'sm',
        highlightOnHover: true,
      },
      styles: { td: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    Tabs: {
      styles: { tab: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    NavLink: {
      styles: { root: { minHeight: rem(ALTURA_TACTIL_MIN) } },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        transitionProps: { transition: 'pop', duration: DURACION_TRANSICION },
        overlayProps: { backgroundOpacity: 0.45, blur: 2 },
      },
    },
    Drawer: {
      defaultProps: {
        transitionProps: { duration: DURACION_TRANSICION },
        overlayProps: { backgroundOpacity: 0.45, blur: 2 },
      },
    },
    Tooltip: {
      defaultProps: { transitionProps: { transition: 'fade', duration: 120 } },
    },
    Paper: {
      defaultProps: { radius: 'lg' },
    },
  },
});
