import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * Tema base del sistema de trazabilidad.
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
 *  3. Densidad de información → los espaciados son compactos y el radio es
 *     chico, para que entren más filas por pantalla. La densidad se gana en el
 *     espaciado *entre* elementos, nunca achicando el área de toque.
 *
 * Sin transiciones ni animaciones: `respectReducedMotion` queda en true y no se
 * define ninguna animación decorativa. El movimiento en una pantalla de planta
 * es ruido, y en un registro BPF puede confundirse con una respuesta del
 * sistema que no ocurrió.
 */

/** Área de toque mínima con guantes, en píxeles. */
const ALTURA_TACTIL_MIN = 44;

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
 * `estadoEnAnalisis`, `estadoAprobado`, `estadoRechazado`) para que la fase 3
 * los consuma por nombre —  `c="estadoAprobado.7"` — sin hardcodear hexadecimales
 * en los componentes de rótulo.
 *
 * Nota documental que conviene no perder: I.20.1 paso 8 dice ROJO para
 * cuarentena, en contradicción con I.20.2. Prevalece I.20.2, que es el POE
 * específico de rotulado y coincide con los registros R.20.2.1 v01 y con
 * I.20.5 v03. Ver inconsistencia 1 de §10 del documento de alcance. La regla
 * RN-04 se implementa en la base como función determinista y columna generada;
 * esta paleta es solamente su representación visual.
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

/**
 * Color de interfaz. Deliberadamente azul: no compite con ninguno de los cuatro
 * colores de estado de I.20.2.
 */
const interfaz: MantineColorsTuple = [
  '#e7f2fb',
  '#d0e2f2',
  '#a1c3e6',
  '#6fa2da',
  '#4886d0',
  '#2f75ca',
  '#1f6cc8',
  '#125bb1',
  '#04519f',
  '#00468d',
];

/**
 * Nombres de los colores de estado de rótulo, para consumo tipado desde la
 * fase 3. Mapear `estado_calidad_enum` contra esta constante evita que un
 * literal de color se filtre a un componente.
 */
export const COLORES_ESTADO_ROTULO = {
  CUARENTENA: 'estadoCuarentena',
  EN_ANALISIS: 'estadoEnAnalisis',
  APROBADO: 'estadoAprobado',
  RECHAZADO: 'estadoRechazado',
} as const;

export type ColorEstadoRotulo =
  (typeof COLORES_ESTADO_ROTULO)[keyof typeof COLORES_ESTADO_ROTULO];

export const theme = createTheme({
  colors: {
    interfaz,
    estadoCuarentena,
    estadoEnAnalisis,
    estadoAprobado,
    estadoRechazado,
  },
  primaryColor: 'interfaz',
  primaryShade: { light: 7, dark: 5 },

  /* Tamaño por defecto de todo control interactivo. */
  fontSmoothing: false,
  defaultRadius: 'sm',

  /* Radio chico: la interfaz es de registro, no de producto de consumo. */
  radius: {
    xs: rem(2),
    sm: rem(3),
    md: rem(4),
    lg: rem(6),
    xl: rem(8),
  },

  /* Espaciado compacto. La densidad se gana acá, no achicando controles. */
  spacing: {
    xs: rem(4),
    sm: rem(8),
    md: rem(12),
    lg: rem(16),
    xl: rem(24),
  },

  /* Tipografía con cuerpo generoso: se lee a distancia de brazo, en tablet. */
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },
  lineHeights: {
    xs: '1.3',
    sm: '1.35',
    md: '1.4',
    lg: '1.45',
    xl: '1.5',
  },

  headings: {
    fontWeight: '700',
  },

  /* Contraste alto: sin sombras suaves que se pierden con luz de planta. */
  shadows: {
    xs: '0 1px 0 rgba(0, 0, 0, 0.15)',
    sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
    md: '0 2px 4px rgba(0, 0, 0, 0.2)',
    lg: '0 3px 6px rgba(0, 0, 0, 0.25)',
    xl: '0 4px 10px rgba(0, 0, 0, 0.25)',
  },

  /* Nada de animaciones decorativas. */
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
    NumberInput: {
      defaultProps: { size: 'md' },
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
      defaultProps: { size: 'lg' },
    },
    Radio: {
      defaultProps: { size: 'lg' },
    },
    Switch: {
      defaultProps: { size: 'lg' },
    },
    /*
     * Tablas: espaciado compacto para densidad, pero las filas conservan la
     * altura táctil porque en varias pantallas la fila entera es el objetivo
     * de toque (seleccionar un lote, abrir un rótulo).
     */
    Table: {
      defaultProps: {
        horizontalSpacing: 'sm',
        verticalSpacing: 'xs',
        withTableBorder: true,
        withColumnBorders: true,
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
      defaultProps: { transitionProps: { duration: 0 } },
    },
    Tooltip: {
      defaultProps: { transitionProps: { duration: 0 } },
    },
  },
});
