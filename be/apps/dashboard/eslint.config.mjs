// @ts-check
import { defineConfig } from 'eslint-config-hyoban'

export default defineConfig(
  {
    formatting: false,
    lessOpinionated: true,
    preferESM: false,
    react: true,
    tailwindCSS: false,
  },
  {
    settings: {
      tailwindcss: {
        whitelist: ['center'],
      },
    },
    rules: {
      'unicorn/prefer-math-trunc': 'off',
      '@eslint-react/no-clone-element': 0,
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 0,
      // NOTE: Disable this temporarily
      'react-compiler/react-compiler': 0,
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
      'no-restricted-syntax': 0,
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
  {
    files: ['**/*.tsx'],
    rules: {
      '@stylistic/jsx-self-closing-comp': 'error',
    },
  },
)
