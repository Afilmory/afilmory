import fs from 'node:fs'
import path from 'node:path'

import { set } from 'es-toolkit/compat'
import type { Plugin } from 'vite'

import { MONOREPO_ROOT_PATH } from './__internal__/constants'

export function localesPlugin(): Plugin {
  return {
    name: 'locales-merge',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const namespaces = fs.readdirSync(MONOREPO_ROOT_PATH).filter((dir) => dir !== '.DS_Store')
      const languageResources = {} as any

      namespaces.forEach((namespace) => {
        const namespacePath = path.join(MONOREPO_ROOT_PATH, namespace)
        const files = fs.readdirSync(namespacePath).filter((file) => file.endsWith('.json'))

        files.forEach((file) => {
          const lang = path.basename(file, '.json')
          const filePath = path.join(namespacePath, file)
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

          if (!languageResources[lang]) {
            languageResources[lang] = {}
          }

          const obj = {}

          const keys = Object.keys(content as object)
          for (const accessorKey of keys) {
            set(obj, accessorKey, (content as any)[accessorKey])
          }

          languageResources[lang][namespace] = obj
        })
      })

      Object.entries(languageResources).forEach(([lang, resources]) => {
        const fileName = `locales/${lang}.js`

        const content = `export default ${JSON.stringify(resources)};`

        this.emitFile({
          type: 'asset',
          fileName,
          source: content,
        })
      })

      // Remove original JSON chunks
      Object.keys(bundle).forEach((key) => {
        if (key.startsWith('locales/') && key.endsWith('.json')) {
          delete bundle[key]
        }
      })
    },
  }
}
