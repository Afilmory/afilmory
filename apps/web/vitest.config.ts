import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    // Mirrors the `~/*` path mapping in tsconfig.json so tests can import modules
    // that use the alias (vitest does not read vite.config.ts when this file exists).
    alias: {
      '~': path.resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
  },
})
