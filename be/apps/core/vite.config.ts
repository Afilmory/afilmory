import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { builtinModules, createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import swc from 'unplugin-swc'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import tsconfigPaths from 'vite-tsconfig-paths'

const NODE_BUILT_IN_MODULES = builtinModules.filter(m => !m.startsWith('_'))
NODE_BUILT_IN_MODULES.push(...NODE_BUILT_IN_MODULES.map(m => `node:${m}`))

const __dirname = dirname(fileURLToPath(import.meta.url))

const external = ['sharp', 'nodejs-snowflake', 'ioredis', 'pg-native', 'heic-convert', 'satori', '@resvg/resvg-js']
const buildOnlyExternal = ['fsevents']

type ModuleRequire = ReturnType<typeof createRequire>

async function resolveInstalledVersion(req: ModuleRequire, name: string): Promise<string> {
  let dir = dirname(req.resolve(name))
  while (dir !== dirname(dir)) {
    try {
      const parsed = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf-8'))
      if (parsed?.name === name && typeof parsed.version === 'string') {
        return parsed.version
      }
    }
    catch {}
    dir = dirname(dir)
  }
  throw new Error(
    `[generate-externals-package-json] Cannot resolve installed version of "${name}"; add it to be/apps/core dependencies`,
  )
}

function generateExternalsPackageJson(externals: string[]) {
  const req = createRequire(import.meta.url)
  let outDirAbs = ''
  const plugin: import('vite').Plugin = {
    name: 'generate-externals-package-json',
    apply: 'build',
    configResolved(config) {
      outDirAbs = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const dependencies: Record<string, string> = {}
      for (const name of externals) {
        dependencies[name] = await resolveInstalledVersion(req, name)
      }
      const content = {
        private: true,
        type: 'module',
        dependencies,
      }
      await mkdir(outDirAbs, { recursive: true })
      await writeFile(resolve(outDirAbs, 'package.json'), JSON.stringify(content, null, 2))
    },
  }
  return plugin
}
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite(),
    analyzer({ enabled: process.env.ANALYZER === 'true' }),
    generateExternalsPackageJson(external),
  ],
  esbuild: false,
  resolve: {
    alias: {
      '@afilmory/be-utils': resolve(__dirname, '../../packages/utils/src'),
      '@afilmory/be-utils/': `${resolve(__dirname, '../../packages/utils/src')}/`,
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
  },
  ssr: {
    noExternal: true,
    external: [...external, ...buildOnlyExternal],
  },
  build: {
    ssr: true,
    ssrEmitAssets: true,
    rollupOptions: {
      external: NODE_BUILT_IN_MODULES,

      input: {
        main: resolve(__dirname, 'src/index.ts'),
      },
    },
  },
})
