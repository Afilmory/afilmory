// @ts-check
import { globalIgnores } from 'eslint/config'
import { defineConfig } from 'eslint-config-hyoban'

import checkI18nJson from './plugins/eslint/eslint-check-i18n-json.js'
import recursiveSort from './plugins/eslint/eslint-recursive-sort.js'

// In flat config, some large generated folders slipped through. To be extra safe,
// put ignores in a top-level config object first, then append the rest.
const rootIgnores = globalIgnores([
  'apps/ssr/src/index.html.ts',
  'apps/ssr/public/**',
  'apps/web/public/**',
  'packages/docs/public/**',
])

const hyobanConfig = await defineConfig(
  {
    formatting: false,
    lessOpinionated: true,
    preferESM: false,
    react: true,
    tailwindCSS: true,
  },

  {
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },

    // TailwindCSS v4 usually has no config file. Silence the plugin's
    // config resolution warning by explicitly disabling auto-resolution.
    settings: {
      tailwindcss: {
        // ESLint plugin will not attempt to resolve tailwind config
        // which avoids repeated "Cannot resolve default tailwindcss config path" warnings.
        config: false,
      },
    },
    rules: {
      'unicorn/no-abusive-eslint-disable': 0,
      '@typescript-eslint/triple-slash-reference': 0,
      'unicorn/prefer-math-trunc': 'off',
      'unicorn/no-static-only-class': 'off',
      '@eslint-react/no-clone-element': 0,
      // TailwindCSS v4 not support
      'tailwindcss/no-custom-classname': 0,
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 0,
      // NOTE: Disable this temporarily
      'react-compiler/react-compiler': 0,
      'no-restricted-syntax': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
      // disable react compiler rules for now
      'react-hooks/no-unused-directives': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/component-hook-factories': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',

      'unicorn/no-array-callback-reference': 'off',

      'no-restricted-globals': [
        'error',
        {
          name: 'location',
          message:
            "Since you don't use the same router instance in electron and browser, you can't use the global location to get the route info. \n\n" +
            'You can use `useLocaltion` or `getReadonlyRoute` to get the route info.',
        },
      ],
    },
  },

  // @ts-expect-error
  {
    files: ['locales/**/*.json'],
    plugins: {
      'recursive-sort': recursiveSort,
      'check-i18n-json': checkI18nJson,
    },
    rules: {
      'recursive-sort/recursive-sort': 'error',
      'check-i18n-json/valid-i18n-keys': 'error',
      'check-i18n-json/no-extra-keys': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      '@stylistic/jsx-self-closing-comp': 'error',
    },
  },

  // Backend framework isn't React — disable React-specific hooks rule there.
  {
    files: ['be/packages/framework/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // Redundant but harmless: keep a local ignore in case this block is used standalone somewhere
  globalIgnores(['apps/ssr/src/index.html.ts', 'apps/ssr/public/**', 'apps/web/public/**', 'packages/docs/public/**']),
)

export default [
  // Ensure ignores are applied globally before any other configs
  rootIgnores,
  ...hyobanConfig,
]
