import type {
  BuilderConfig,
  BuilderOptions,
  PhotoManifestItem,
  PhotoProcessingContext,
  PhotoProcessorOptions,
  StorageConfig,
  StorageObject,
} from '@afilmory/builder'
import {
  AfilmoryBuilder,
  processPhotoWithPipeline,
  THUMBNAIL_PLUGIN_SYMBOL,
  thumbnailStoragePlugin,
} from '@afilmory/builder'
import type { Logger as BuilderLogger } from '@afilmory/builder/logger/index.js'
import {
  createPhotoProcessingLoggers,
  createStorageKeyNormalizer,
  runWithPhotoExecutionContext,
} from '@afilmory/builder/photo/index.js'
import type { _Object } from '@aws-sdk/client-s3'
import { logger as coreLogger } from 'core/helpers/logger.helper'
import { injectable } from 'tsyringe'

import { createBuilderLoggerAdapter } from './photo-builder-logger.adapter'

const DEFAULT_PROCESSOR_OPTIONS: PhotoProcessorOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
}

export type ProcessPhotoOptions = {
  existingItem?: PhotoManifestItem
  livePhotoMap?: Map<string, StorageObject>
  processorOptions?: Partial<PhotoProcessorOptions>
  builder?: AfilmoryBuilder
  builderConfig?: BuilderConfig
}

@injectable()
export class PhotoBuilderService {
  private readonly baseLogger = coreLogger.extend('PhotoBuilder')
  private readonly builderLogger: BuilderLogger = createBuilderLoggerAdapter(this.baseLogger)

  createBuilder(config: BuilderConfig): AfilmoryBuilder {
    const enhancedConfig = this.ensureThumbnailPlugin(config)
    return new AfilmoryBuilder(enhancedConfig)
  }

  applyStorageConfig(builder: AfilmoryBuilder, config: StorageConfig): void {
    builder.getStorageManager().switchProvider(config)
  }

  async processPhotoFromStorageObject(
    object: StorageObject,
    options?: ProcessPhotoOptions,
  ): Promise<Awaited<ReturnType<typeof processPhotoWithPipeline>>> {
    const { existingItem, livePhotoMap, processorOptions, builder, builderConfig } = options ?? {}
    const activeBuilder = this.resolveBuilder(builder, builderConfig)
    await activeBuilder.ensurePluginsReady()

    const mergedOptions: PhotoProcessorOptions = {
      ...DEFAULT_PROCESSOR_OPTIONS,
      ...processorOptions,
    }

    const photoLoggers = createPhotoProcessingLoggers(0, this.builderLogger)
    const context: PhotoProcessingContext = {
      photoKey: object.key,
      obj: this.toLegacyObject(object),
      existingItem,
      livePhotoMap: this.toLegacyLivePhotoMap(livePhotoMap),
      options: mergedOptions,
      pluginData: {},
    }

    const runtime = this.createPluginRuntime(activeBuilder, mergedOptions, builderConfig)
    const storageManager = activeBuilder.getStorageManager()
    const storageConfig = activeBuilder.getStorageConfig()

    return await runWithPhotoExecutionContext(
      {
        builder: activeBuilder,
        storageManager,
        storageConfig,
        normalizeStorageKey: createStorageKeyNormalizer(storageConfig),
        loggers: photoLoggers,
      },
      async () => await processPhotoWithPipeline(context, runtime),
    )
  }

  private resolveBuilder(builder?: AfilmoryBuilder, builderConfig?: BuilderConfig): AfilmoryBuilder {
    if (builder) {
      return builder
    }

    if (builderConfig) {
      return this.createBuilder(builderConfig)
    }

    throw new Error(
      'PhotoBuilderService requires a builder instance or configuration. Pass builder or builderConfig in ProcessPhotoOptions.',
    )
  }

  private createPluginRuntime(
    builder: AfilmoryBuilder,
    processorOptions: PhotoProcessorOptions,
    builderConfig?: BuilderConfig,
  ): { runState: ReturnType<AfilmoryBuilder['createPluginRunState']>; builderOptions: BuilderOptions } {
    const config = builderConfig ?? builder.getConfig()

    const builderOptions: BuilderOptions = {
      isForceMode: processorOptions.isForceMode,
      isForceManifest: processorOptions.isForceManifest,
      isForceThumbnails: processorOptions.isForceThumbnails,
      concurrencyLimit: config.system.processing.defaultConcurrency,
    }

    return {
      runState: builder.createPluginRunState(),
      builderOptions,
    }
  }

  private toLegacyObject(object: StorageObject): _Object {
    return {
      Key: object.key,
      Size: object.size,
      LastModified: object.lastModified,
      ETag: object.etag,
    }
  }

  private toLegacyLivePhotoMap(livePhotoMap?: Map<string, StorageObject>): Map<string, _Object> {
    if (!livePhotoMap) {
      return new Map()
    }

    const result = new Map<string, _Object>()

    for (const [key, value] of livePhotoMap) {
      result.set(key, this.toLegacyObject(value))
    }

    return result
  }

  private ensureThumbnailPlugin(config: BuilderConfig): BuilderConfig {
    const existingPlugins = config.plugins
    const hasPlugin = existingPlugins.some((entry) => {
      // Check for the unique Symbol identifier for reliable detection
      if (typeof entry === 'object' && entry !== null && THUMBNAIL_PLUGIN_SYMBOL in entry) {
        return true
      }
      return false
    })

    if (hasPlugin) {
      return config
    }

    return {
      ...config,
      plugins: [...existingPlugins, thumbnailStoragePlugin()],
    }
  }
}
