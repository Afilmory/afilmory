import 'dotenv/config'

import { fileURLToPath, resolve } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import reactRefresh from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import { checker } from 'vite-plugin-checker'
import { routeBuilderPlugin } from 'vite-plugin-route-builder'
import tsconfigPaths from 'vite-tsconfig-paths'

import { astPlugin } from '../../../plugins/vite/ast'
import PKG from './package.json'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const API_TARGET = process.env.CORE_API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [
    reactRefresh(),
    tsconfigPaths(),
    checker({
      typescript: true,
      enableBuild: true,
    }),
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey'],
    }),
    tailwindcss(),
    routeBuilderPlugin({
      pagePattern: `${resolve(ROOT, './src/pages')}/**/*.tsx`,
      outputPath: `${resolve(ROOT, './src/generated-routes.ts')}`,
      enableInDev: true,
    }),
    astPlugin,
  ],
  define: {
    APP_DEV_CWD: JSON.stringify(process.cwd()),
    APP_NAME: JSON.stringify(PKG.name),
  },
  server: {
    cors: {
      origin: true,
      credentials: true,
    },
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        xfwd: true,
        // keep path as-is so /api -> backend /api
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const originalHost = req.headers.host
            if (originalHost) {
              const normalizedHost = Array.isArray(originalHost) ? originalHost[0] : originalHost
              // Preserve SPA host for tenant resolution regardless of changeOrigin behaviour
              proxyReq.setHeader('host', normalizedHost)
              proxyReq.setHeader('x-forwarded-host', normalizedHost)
            }

            const originHeader = req.headers.origin
            if (originHeader) {
              proxyReq.setHeader('origin', Array.isArray(originHeader) ? originHeader[0] : originHeader)
            }
          })
        },
      },
    },
  },
})
