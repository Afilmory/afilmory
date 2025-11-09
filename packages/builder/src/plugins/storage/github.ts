import type { GitHubConfig } from '../../storage/interfaces.js'
import { GitHubStorageProvider } from '../../storage/providers/github-provider.js'
import type { BuilderPlugin } from '../types.js'

export interface GitHubStoragePluginOptions {
  provider?: string
}

export default function githubStoragePlugin(options: GitHubStoragePluginOptions = {}): BuilderPlugin {
  const providerName = options.provider ?? 'github'

  return {
    name: `afilmory:storage:${providerName}`,
    hooks: {
      onInit: ({ registerStorageProvider }) => {
        registerStorageProvider(providerName, (config) => {
          return new GitHubStorageProvider(config as GitHubConfig)
        })
      },
    },
  }
}
