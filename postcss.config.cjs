/**
 * Configuración de PostCSS para Mantine 8.
 * Fuente: https://mantine.dev/styles/postcss-preset/
 *
 * Los breakpoints se declaran acá como variables de `postcss-simple-vars` para
 * que las media queries de los componentes propios usen los mismos cortes que
 * los de Mantine. La planta trabaja sobre tablet: `sm` y `md` son los tamaños
 * que importan.
 */
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
