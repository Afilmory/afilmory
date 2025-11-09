import type { AfilmoryBuilder, BuilderOptions, BuilderResult } from '../builder/builder.js'
import type { Logger } from '../logger/index.js'
import type { PhotoProcessingContext } from '../photo/image-pipeline.js'
import type { PhotoProcessorOptions } from '../photo/processor.js'
import type { StorageObject } from '../storage/interfaces.js'
import type { BuilderConfig } from '../types/config.js'
import type { AfilmoryManifest, CameraInfo, LensInfo } from '../types/manifest.js'
import type { PhotoManifestItem, ProcessPhotoResult } from '../types/photo.js'

export type BuilderPluginESMImporter = () => Promise<{
  default: (() => BuilderPlugin | Promise<BuilderPlugin>) | BuilderPlugin
}>
export type BuilderPluginReference = string | BuilderPluginESMImporter

export type BuilderPluginConfigEntry = BuilderPluginReference | BuilderPlugin

export interface BuilderPluginInitContext {
  builder: AfilmoryBuilder
  config: BuilderConfig
  logger: Logger
  registerStorageProvider: AfilmoryBuilder['registerStorageProvider']
  /**
   * Options provided in the configuration for this plugin.
   */
  pluginOptions: unknown
}

export interface BuilderPluginEventPayloads {
  beforeBuild: {
    options: BuilderOptions
  }
  beforePhotoProcess: {
    options: BuilderOptions
    context: PhotoProcessingContext
  }
  afterPhotoProcess: {
    options: BuilderOptions
    context: PhotoProcessingContext
    result: {
      type: ProcessPhotoResult['type']
      item: PhotoManifestItem | null
      pluginData: Record<string, unknown>
    }
  }
  photoProcessError: {
    options: BuilderOptions
    context: PhotoProcessingContext
    error: unknown
  }
  afterManifestLoad: {
    options: BuilderOptions
    manifest: AfilmoryManifest
    manifestMap: Map<string, PhotoManifestItem>
  }
  afterAllFilesListed: {
    options: BuilderOptions
    allObjects: StorageObject[]
  }
  afterLivePhotoDetection: {
    options: BuilderOptions
    livePhotoMap: Map<string, StorageObject>
  }
  afterImagesListed: {
    options: BuilderOptions
    imageObjects: StorageObject[]
  }
  afterTasksPrepared: {
    options: BuilderOptions
    tasks: StorageObject[]
    totalImages: number
  }
  beforeProcessTasks: {
    options: BuilderOptions
    tasks: StorageObject[]
    processorOptions: PhotoProcessorOptions
    mode: 'cluster' | 'worker'
    concurrency: number
  }
  afterProcessTasks: {
    options: BuilderOptions
    tasks: StorageObject[]
    results: ProcessPhotoResult[]
    manifest: PhotoManifestItem[]
    stats: {
      newCount: number
      processedCount: number
      skippedCount: number
    }
  }
  afterCleanup: {
    options: BuilderOptions
    manifest: PhotoManifestItem[]
    deletedCount: number
  }
  beforeAddManifestItem: {
    options: BuilderOptions
    item: PhotoManifestItem
    pluginData: Record<string, unknown>
    resultType: ProcessPhotoResult['type']
  }
  beforeSaveManifest: {
    options: BuilderOptions
    manifest: PhotoManifestItem[]
    cameras: CameraInfo[]
    lenses: LensInfo[]
  }
  afterSaveManifest: {
    options: BuilderOptions
    manifest: PhotoManifestItem[]
    cameras: CameraInfo[]
    lenses: LensInfo[]
  }
  afterBuild: {
    options: BuilderOptions
    result: BuilderResult
    manifest: PhotoManifestItem[]
  }
  onError: {
    options: BuilderOptions
    error: unknown
  }
}

export type BuilderPluginEvent = keyof BuilderPluginEventPayloads

export interface BuilderPluginHookContext<TEvent extends BuilderPluginEvent> {
  builder: AfilmoryBuilder
  config: BuilderConfig
  logger: Logger
  options: BuilderOptions
  registerStorageProvider: AfilmoryBuilder['registerStorageProvider']
  /**
   * Name of the plugin handling the current hook.
   */
  pluginName: string
  /**
   * Options associated with the plugin, if any.
   */
  pluginOptions: unknown
  /**
   * A mutable map scoped to the current build run, allowing plugins
   * to persist information between lifecycle hooks.
   */
  runShared: Map<string, unknown>
  event: TEvent
  payload: BuilderPluginEventPayloads[TEvent]
}

export type BuilderPluginHook<TEvent extends BuilderPluginEvent> = (
  context: BuilderPluginHookContext<TEvent>,
) => void | Promise<void>

export type BuilderPluginLifecycleHooks = Partial<{
  [Event in BuilderPluginEvent]: BuilderPluginHook<Event>
}>

export interface BuilderPluginHooks extends BuilderPluginLifecycleHooks {
  onInit?: (context: BuilderPluginInitContext) => void | Promise<void>
}

export interface BuilderPlugin {
  name?: string
  hooks?: BuilderPluginHooks
}

export type BuilderPluginFactory =
  | BuilderPlugin
  | (() => BuilderPlugin | Promise<BuilderPlugin>)
  | ((options: unknown) => BuilderPlugin | Promise<BuilderPlugin>)

export function isPluginESMImporter(value: BuilderPluginConfigEntry): value is BuilderPluginESMImporter {
  return typeof value === 'function' && value.length === 0
}
