export * from '../../utils/src/u8array.js'
export type { BuilderOptions, BuilderResult } from './builder/index.js'
export { AfilmoryBuilder } from './builder/index.js'
export { createDefaultBuilderConfig } from './config/defaults.js'
export { defineBuilderConfig } from './config/helper.js'
export type { LoadBuilderConfigOptions } from './config/index.js'
export { resolveBuilderConfig } from './config/index.js'
export type { PhotoProcessingContext, ProcessedImageData } from './photo/image-pipeline.js'
export {
  executePhotoProcessingPipeline,
  preprocessImage,
  processImageWithSharp,
  processPhotoWithPipeline,
} from './photo/image-pipeline.js'
export type { PhotoProcessorOptions } from './photo/processor.js'
export type { GeocodingPluginOptions } from './plugins/geocoding.js'
export { default as geocodingPlugin } from './plugins/geocoding.js'
export type { GitHubRepoSyncPluginOptions } from './plugins/github-repo-sync.js'
export { createGitHubRepoSyncPlugin, default as githubRepoSyncPlugin } from './plugins/github-repo-sync.js'
export type { OgImagePluginOptions, OgVendorConfig } from './plugins/og-image-storage/index.js'
export { default as ogImagePlugin } from './plugins/og-image-storage/index.js'
export type { B2StoragePluginOptions } from './plugins/storage/b2.js'
export { default as b2StoragePlugin } from './plugins/storage/b2.js'
export type { EagleStoragePluginOptions } from './plugins/storage/eagle.js'
export { default as eagleStoragePlugin } from './plugins/storage/eagle.js'
export type { GitHubStoragePluginOptions } from './plugins/storage/github.js'
export { default as githubStoragePlugin } from './plugins/storage/github.js'
export type { LocalStoragePluginOptions } from './plugins/storage/local.js'
export { default as localStoragePlugin } from './plugins/storage/local.js'
export type { S3StoragePluginOptions } from './plugins/storage/s3.js'
export { default as s3StoragePlugin } from './plugins/storage/s3.js'
export type { ThumbnailStoragePluginOptions } from './plugins/thumbnail-storage/index.js'
export { THUMBNAIL_PLUGIN_SYMBOL, default as thumbnailStoragePlugin } from './plugins/thumbnail-storage/index.js'
export type {
  BuilderPlugin,
  BuilderPluginConfigEntry,
  BuilderPluginEvent,
  BuilderPluginEventPayloads,
  BuilderPluginHookContext,
  BuilderPluginHooks,
  BuilderPluginReference,
} from './plugins/types.js'
export type {
  LocalStorageConfig,
  LocalStorageProviderName,
  ProgressCallback,
  RemoteStorageConfig,
  RemoteStorageProviderName,
  ScanProgress,
  StorageConfig,
  StorageObject,
  StorageProvider,
  StorageProviderCategory,
} from './storage/index.js'
export type { StorageProviderFactory, StorageProviderRegistrationOptions } from './storage/index.js'
export { LOCAL_STORAGE_PROVIDERS, REMOTE_STORAGE_PROVIDERS } from './storage/index.js'
export { StorageFactory, StorageManager } from './storage/index.js'
export type { B2Config, ManagedStorageConfig, S3CompatibleConfig } from './storage/interfaces.js'
export type { BuilderConfig, BuilderConfigInput } from './types/config.js'
export type { S3ObjectLike } from './types/s3.js'
export type {
  AfilmoryManifest,
  CameraInfo,
  FujiRecipe,
  LensInfo,
  PhotoManifestItem,
  PickedExif,
  ToneAnalysis,
} from '@afilmory/typing'

/// // Mirgation
export { migrateManifest } from './manifest/migrate.js'
export { CURRENT_MANIFEST_VERSION } from './manifest/version.js'
