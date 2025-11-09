import type { LocalConfig } from '../../storage/interfaces.js'
import { LocalStorageProvider } from '../../storage/providers/local-provider.js'
import type { BuilderPlugin } from '../types.js'

export interface LocalStoragePluginOptions {
  provider?: string
}

export default function localStoragePlugin(options: LocalStoragePluginOptions = {}): BuilderPlugin {
  const providerName = options.provider ?? 'local'

  return {
    name: `afilmory:storage:${providerName}`,
    hooks: {
      onInit: ({ registerStorageProvider }) => {
        registerStorageProvider(providerName, (config) => {
          return new LocalStorageProvider(config as LocalConfig)
        })
      },
    },
  }
}
