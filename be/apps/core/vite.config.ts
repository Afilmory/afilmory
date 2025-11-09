import { readFile, writeFile } from 'node:fs/promises'
import { builtinModules, createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import swc from 'unplugin-swc'
import { defineConfig } from 'vite'
import { analyzer } from 'vite-bundle-analyzer'
import tsconfigPaths from 'vite-tsconfig-paths'

const NODE_BUILT_IN_MODULES = builtinModules.filter((m) => !m.startsWith('_'))
NODE_BUILT_IN_MODULES.push(...NODE_BUILT_IN_MODULES.map((m) => `node:${m}`))

const __dirname = dirname(fileURLToPath(import.meta.url))

const external = ['sharp', 'nodejs-snowflake', 'ioredis', 'heic-convert', 'satori', '@resvg/resvg-js']
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
        try {
          const pkgJsonPath = req.resolve(`${name}/package.json`)
          const raw = await readFile(pkgJsonPath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (parsed?.version) {
            dependencies[name] = parsed.version as string
          }
        } catch {
          continue
        }
      }
      const content = {
        private: true,
        type: 'module',
        dependencies,
      }
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
  ssr: {
    noExternal: true,
    external,
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
