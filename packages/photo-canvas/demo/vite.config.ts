import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../apps/web/public', import.meta.url)),
  server: { port: 4517, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
})
