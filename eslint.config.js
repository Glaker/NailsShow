import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'supabase/.temp', 'src/lib/database.types.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      /*
       * `eslint-config-prettier` va ÚLTIMO: apaga toda regla de formato de
       * ESLint para que no compita con Prettier. Formato lo decide Prettier;
       * corrección lo decide ESLint. Sin superposición.
       */
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      /* Sin `any`, ni implícito ni explícito. */
      '@typescript-eslint/no-explicit-any': 'error',

      /*
       * Barrera de editor contra la clave service_role.
       *
       * El gate real de CI es `scripts/check-service-role.sh`, que revisa el
       * bundle construido y todo tipo de archivo. Esta regla es la señal
       * temprana: marca el problema mientras se tipea, antes de llegar a CI.
       * Ver CLAUDE.md §5 e invariante 4 de §3.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/service_role|SUPABASE_SERVICE/i], TemplateElement[value.raw=/service_role|SUPABASE_SERVICE/i]',
          message:
            'La clave de servicio tiene BYPASSRLS y no puede aparecer en el cliente. ' +
            'Usá el token del usuario, o un rol de base dedicado sin BYPASSRLS. ' +
            'Ver CLAUDE.md §5 e invariante 4 de §3.',
        },
        {
          selector:
            "MemberExpression[object.type='MetaProperty'] > Identifier[name=/SERVICE/i]",
          message:
            'No se leen variables de entorno de servicio desde el cliente. Ver CLAUDE.md §5.',
        },
      ],
    },
  },
  /* Archivos de configuración: sin type-checking por proyecto. */
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
);
