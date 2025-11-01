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

        // Simple per-run cache to avoid re-reading the same metadata file
        const cacheKey = 'afilmory:eagle:imageMetaCache'
        type EagleMeta = {
          name?: string
          tags?: string[]
          folderTags?: string[]
        }
        let cache = runShared.get(cacheKey) as Map<string, EagleMeta> | undefined
        if (!cache) {
          cache = new Map<string, EagleMeta>()
          runShared.set(cacheKey, cache)
        }

        let meta = cache.get(key)
        if (!meta) {
          try {
            const data = await readImageMetadata(eagleConfig.libraryPath, key)
            meta = {
              name: data.name,
              tags: Array.isArray(data.tags) ? data.tags : [],
            }
            cache.set(key, meta)
          } catch (error) {
            logger.main.warn(`eagle: failed to read image metadata for key=${key}: ${String(error)}`)
            return
          }
        }

        // Append folder names as tags if enabled
        if (eagleConfig.folderAsTag) {
          try {
            const indexCacheKey = 'afilmory:eagle:folderIndex'
            let folderIndex = runShared.get(indexCacheKey) as Map<string, string[]> | undefined
            if (!folderIndex) {
              folderIndex = await getEagleFolderIndex(eagleConfig.libraryPath)
              runShared.set(indexCacheKey, folderIndex)
            }
            const data = await readImageMetadata(eagleConfig.libraryPath, key)
            const folderNames = (data.folders ?? [])
              .map((id) => folderIndex?.get(id))
              .filter((p): p is string[] => Array.isArray(p) && p.length > 0)
              .map((p) => p.at(-1) as string) // take leaf folder name
            if (folderNames.length > 0) {
              const merged = new Set([...(meta.tags ?? []), ...folderNames])
              meta.folderTags = folderNames
              meta.tags = Array.from(merged)
            }
          } catch (e) {
            logger.main.warn(`eagle: failed to append folder tags for key=${key}: ${String(e)}`)
          }
        }
        // Overwrite title and tags with Eagle metadata when available
        if (meta?.name) payload.item.title = meta.name
        if (meta?.tags) payload.item.tags = meta.tags
      },
    },
  }
}
