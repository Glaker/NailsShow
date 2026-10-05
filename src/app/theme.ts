import {
  createTheme,
  rem,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

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
 * Rediseño del 2026-10-04, con la línea visual de Apple como referencia pedida:
 * sobrio, minimalista y limpio. La interfaz es casi toda neutra (grises fríos,
 * blanco, casi negro) y tiene un único color de acción, el azul. El arcoíris
 * vive solo en el logo.
 *
 * La condición de siempre se mantiene: el color de interfaz no puede competir
 * con los cuatro reservados de I.20.2, y un azul no se confunde con amarillo,
 * gris, verde ni rojo. (En la fase 0 el color también era azul, por la misma
 * razón.)
 */

/**
 * Azul de acción: botones primarios, enlaces, selección y foco. Shade 7
 * (#0071e3) en claro, con 4,7:1 de contraste para texto blanco; shade 6
 * (#0a84ff) en oscuro.
 */
const azul: MantineColorsTuple = [
  '#eaf3fe',
  '#d3e6fd',
  '#a7cdfb',
  '#75b1f8',
  '#4a98f6',
  '#2997ff',
  '#0a84ff',
  '#0071e3',
  '#0062c4',
  '#0052a6',
];

/**
 * Escala oscura de Mantine reemplazada por los grises del modo oscuro de
 * Apple: negro puro de fondo, superficies #1c1c1e y #2c2c2e.
 */
const dark: MantineColorsTuple = [
  '#f5f5f7',
  '#d1d1d6',
  '#aeaeb2',
  '#8e8e93',
  '#636366',
  '#48484a',
  '#3a3a3c',
  '#2c2c2e',
  '#1c1c1e',
  '#000000',
];

/**
 * Superficies y bordes de la aplicación. Son variables CSS (global.css) para
 * que cambien solas entre modo claro y oscuro.
 */
export const SUPERFICIE = {
  /** Fondo general: gris claro en claro, negro en oscuro. */
  fondo: 'var(--app-fondo)',
  /** Fondo de tarjeta. */
  tarjeta: 'var(--mantine-color-body)',
  /** Borde de tarjeta y de tabla. */
  borde: 'var(--superficie-borde)',
  /** Fondo de la barra lateral. */
  barra: 'var(--app-barra)',
  /** Texto secundario dentro de la barra lateral. */
  barraTexto: 'var(--app-barra-texto)',
} as const;

/**
 * Nombres de los colores de estado de rótulo, para consumo tipado desde las
 * pantallas. Mapear `estado_calidad_enum` contra esta constante evita que un
 * literal de color se filtre a un componente de rótulo.
 *
 * `RECIBIDO` y `MUESTREADO` no tienen color de rótulo en I.20.2 porque no
 * tienen rótulo: son estados internos del circuito. Se muestran en la escala
 * de interfaz (índigo, para no confundirse con el azul de saldo de apertura),
 * nunca en una de las cuatro reservadas.
 */
export const COLORES_ESTADO_ROTULO = {
  RECIBIDO: 'indigo',
  CUARENTENA: 'estadoCuarentena',
  MUESTREADO: 'indigo',
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

/**
 * Variables de Mantine que cambian por esquema. Los grises de texto atenuado de
 * fábrica (gray.6, 3,3:1 sobre blanco) no alcanzan el 4,5:1 que pide una tablet
 * con película protectora: se oscurecen en claro y se aclaran en oscuro.
 */
export const resolverVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#ffffff',
    '--mantine-color-text': '#1d1d1f',
    '--mantine-color-dimmed': '#6e6e73',
    '--mantine-color-placeholder': '#86868b',
    '--mantine-color-default-border': '#d2d2d7',
  },
  dark: {
    '--mantine-color-body': '#1c1c1e',
    '--mantine-color-text': '#f5f5f7',
    '--mantine-color-dimmed': '#a1a1a6',
    '--mantine-color-placeholder': '#8e8e93',
    '--mantine-color-default-border': '#3a3a3c',
  },
});

/**
 * La letra del sistema de Apple (SF Pro) donde existe, en Mac, iPhone y iPad.
 * En Windows y Android, Inter (public/fonts, ver global.css): la más cercana a
 * SF con licencia libre. Segoe UI y Roboto quedan de último respaldo.
 */
const FUENTE =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  colors: {
    azul,
    dark,
    estadoCuarentena,
    estadoEnAnalisis,
    estadoAprobado,
    estadoRechazado,
  },
  primaryColor: 'azul',
  primaryShade: { light: 7, dark: 6 },

  fontSmoothing: true,
  defaultRadius: 'md',

  fontFamily: FUENTE,
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',

  /*
   * Esquinas amplias, como en las superficies de Apple: los campos en 10 px,
   * las tarjetas en 16 y los botones en píldora.
   */
  radius: {
    xs: rem(6),
    sm: rem(8),
    md: rem(10),
    lg: rem(16),
    xl: rem(22),
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
    sm: rem(13.5),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },
  lineHeights: {
    xs: '1.3',
    sm: '1.4',
    md: '1.45',
    lg: '1.45',
    xl: '1.4',
  },

  headings: {
    fontFamily: FUENTE,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(30), lineHeight: '1.12' },
      h2: { fontSize: rem(22), lineHeight: '1.2' },
      h3: { fontSize: rem(18), lineHeight: '1.3' },
      h4: { fontSize: rem(15.5), lineHeight: '1.35' },
    },
  },

  /* Sombras suaves y cortas: separan la tarjeta del fondo sin ensuciarla. */
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 14px rgba(0, 0, 0, 0.07)',
    lg: '0 8px 28px rgba(0, 0, 0, 0.09)',
    xl: '0 16px 48px rgba(0, 0, 0, 0.12)',
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
      defaultProps: { size: 'md', radius: 'xl' },
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
      /*
       * Cabeceras chicas, semibold y atenuadas, en minúscula de oración como en
       * las tablas de macOS: la fila de datos es lo que pesa.
       */
      styles: {
        td: { minHeight: rem(ALTURA_TACTIL_MIN) },
        th: {
          fontSize: rem(12.5),
          fontWeight: 600,
          color: 'var(--mantine-color-dimmed)',
        },
      },
    },
    Badge: {
      defaultProps: { radius: 'xl' },
      styles: { root: { fontWeight: 600, letterSpacing: 0, textTransform: 'none' } },
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
        overlayProps: { backgroundOpacity: 0.5, blur: 0 },
      },
    },
    Drawer: {
      defaultProps: {
        transitionProps: { duration: DURACION_TRANSICION },
        overlayProps: { backgroundOpacity: 0.5, blur: 0 },
      },
    },
    Tooltip: {
      defaultProps: { transitionProps: { transition: 'fade', duration: 120 } },
    },
    // Menús y desplegables se abren con el mismo «pop» que los modales.
    Menu: {
      defaultProps: { transitionProps: { transition: 'pop-top-right', duration: 180 } },
    },
    Popover: {
      defaultProps: { transitionProps: { transition: 'pop', duration: 180 } },
    },
    Combobox: {
      defaultProps: { transitionProps: { transition: 'pop', duration: 160 } },
    },
    Paper: {
      defaultProps: { radius: 'lg' },
    },
  },
});
