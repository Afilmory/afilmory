// 主要处理器
export type { PhotoProcessorOptions } from './processor.js'
export { processPhoto } from './processor.js'

// 缓存管理
export type { CacheableData } from './cache-manager.js'
export { shouldProcessPhoto } from './cache-manager.js'

// 数据处理器
export type { ThumbnailResult } from './data-processors.js'
export { processExifData, processThumbnailAndBlurhash, processToneAnalysis } from './data-processors.js'

// Live Photo 处理
export type { LivePhotoResult } from './live-photo-handler.js'
export { createLivePhotoMap, processLivePhoto } from './live-photo-handler.js'

// 执行上下文
export {
  createStorageKeyNormalizer,
  getPhotoExecutionContext,
  runWithPhotoExecutionContext,
} from './execution-context.js'

// Logger 适配器
export type { PhotoLogger, PhotoProcessingLoggers } from './logger-adapter.js'
export {
  CompatibleLoggerAdapter,
  createPhotoProcessingLoggers,
  getGlobalLoggers,
  LoggerAdapter,
  setGlobalLoggers,
  WorkerLoggerAdapter,
} from './logger-adapter.js'
