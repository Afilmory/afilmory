import type { EagleConfig } from '../../storage/interfaces.js'
import { EagleStorageProvider, getEagleFolderIndex, readImageMetadata } from '../../storage/providers/eagle-provider.js'
import type { BuilderPlugin } from '../types.js'

export interface EagleStoragePluginOptions {
  provider?: string
}

export default function eagleStoragePlugin(options: EagleStoragePluginOptions = {}): BuilderPlugin {
  const providerName = options.provider ?? 'eagle'

  return {
    name: `afilmory:storage:${providerName}`,
    hooks: {
      onInit: ({ registerStorageProvider }) => {
        registerStorageProvider(providerName, (config) => {
          return new EagleStorageProvider(config as EagleConfig)
        })
      },
      /**
       * Inject Eagle image metadata (name, tags) into manifest items before saving.
       * This only applies when the configured storage provider is 'eagle'.
       */
      beforeAddManifestItem: async ({ config, payload, logger, runShared }) => {
        const { storage } = config
        if (!storage || storage.provider !== 'eagle') return

        const eagleConfig = storage
        const key = payload.item.s3Key

        const meta = await readImageMetadata(eagleConfig.libraryPath, key)

        // Append folder names as tags if enabled
        if (eagleConfig.folderAsTag) {
          try {
            const indexCacheKey = 'afilmory:eagle:folderIndex'
            let folderIndex = runShared.get(indexCacheKey) as Map<string, string[]> | undefined
            if (!folderIndex) {
              folderIndex = await getEagleFolderIndex(eagleConfig.libraryPath)
              runShared.set(indexCacheKey, folderIndex)
            }
            const folderNames = (meta.folders ?? [])
              .map((id) => folderIndex?.get(id))
              .filter((p): p is string[] => Array.isArray(p) && p.length > 0)
              .map((p) => p.at(-1) as string) // take leaf folder name
            if (folderNames.length > 0) {
              const merged = new Set([...(meta.tags ?? []), ...folderNames])
              meta.tags = Array.from(merged)
            }
          } catch (e) {
            logger.main.warn(`eagle: failed to append folder tags for key=${key}: ${String(e)}`)
          }
        }
        // Apply omitTagNamesInMetadata filter
        const omit = new Set(eagleConfig.omitTagNamesInMetadata ?? [])
        if (omit.size > 0 && meta.tags) {
          meta.tags = meta.tags.filter((t) => !omit.has(t))
        }
        meta.tags?.sort((a, b) => a.localeCompare(b))

        // Overwrite title and tags with Eagle metadata when available
        if (meta.name) payload.item.title = meta.name
        if (meta.tags) payload.item.tags = meta.tags
      },
    },
  }
}
