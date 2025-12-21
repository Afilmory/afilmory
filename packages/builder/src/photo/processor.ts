import type { PhotoManifestItem, ProcessPhotoResult } from '@afilmory/typing'

import type { AfilmoryBuilder, BuilderOptions } from '../builder/builder.js'
import { logger } from '../logger/index.js'
import type { PluginRunState } from '../plugins/manager.js'
import type { S3ObjectLike } from '../types/s3.js'
import { createStorageKeyNormalizer, runWithPhotoExecutionContext } from './execution-context.js'
import type { PhotoProcessingContext } from './image-pipeline.js'
import { processPhotoWithPipeline } from './image-pipeline.js'
import { createPhotoProcessingLoggers } from './logger-adapter.js'

export interface PhotoProcessorOptions {
  isForceMode: boolean
  isForceManifest: boolean
  isForceThumbnails: boolean
}

// 处理单张照片
export async function processPhoto(
  obj: S3ObjectLike,
  index: number,
  workerId: number,
  totalImages: number,
  existingManifestMap: Map<string, PhotoManifestItem>,
  livePhotoMap: Map<string, S3ObjectLike>,
  threeDSceneMap: Map<string, S3ObjectLike>,
  options: PhotoProcessorOptions,
  builder: AfilmoryBuilder,
  pluginRuntime: {
    runState: PluginRunState
    builderOptions: BuilderOptions
  },
): Promise<ProcessPhotoResult> {
  const key = obj.Key
  if (!key) {
    logger.image.warn(`跳过没有 Key 的对象`)
    return { item: null, type: 'failed' }
  }

  const existingItem = existingManifestMap.get(key)

  // 构建处理上下文
  const context: PhotoProcessingContext = {
    photoKey: key,
    obj,
    existingItem,
    livePhotoMap,
    threeDSceneMap,
    options,
    pluginData: {},
  }

  const storageManager = builder.getStorageManager()
  const storageConfig = builder.getStorageConfig()
  const photoLoggers = createPhotoProcessingLoggers(workerId, logger)

  return await runWithPhotoExecutionContext(
    {
      builder,
      storageManager,
      storageConfig,
      normalizeStorageKey: createStorageKeyNormalizer(storageConfig),
      loggers: photoLoggers,
    },
    async () => {
      photoLoggers.image.info(`📸 [${index + 1}/${totalImages}] ${key}`)

      // 使用处理管道
      return await processPhotoWithPipeline(context, pluginRuntime)
    },
  )
}
