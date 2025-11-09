import { defineConfig } from 'eslint-config-hyoban'

export default defineConfig(
  {
    formatting: false,
  },
  {
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
    rules: {
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-abusive-eslint-disable': 0,
      'unicorn/no-useless-undefined': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
    },
  },
)
