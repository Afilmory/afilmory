import crypto from 'node:crypto'
import path from 'node:path'

import type { PhotoManifestItem, ProcessPhotoResult } from '@afilmory/typing'
import { compressUint8Array } from '@afilmory/utils'
import sharp from 'sharp'

import type { BuilderOptions } from '../builder/builder.js'
import {
  convertBmpToJpegSharpInstance,
  getImageMetadataWithSharp,
  isBitmap,
  preprocessImageBuffer,
} from '../image/processor.js'
import type { PluginRunState } from '../plugins/manager.js'
import { THUMBNAIL_PLUGIN_DATA_KEY } from '../plugins/thumbnail-storage/shared.js'
import type { S3ObjectLike } from '../types/s3.js'
import { shouldProcessPhoto } from './cache-manager.js'
import { processExifData, processThumbnailAndBlurhash, processToneAnalysis } from './data-processors.js'
import { getPhotoExecutionContext } from './execution-context.js'
import { detectGainMap } from './gainmap-detector.js'
import { extractPhotoInfo } from './info-extractor.js'
import { processLivePhoto } from './live-photo-handler.js'
import { getGlobalLoggers } from './logger-adapter.js'
import { detectMotionPhoto } from './motion-photo-detector.js'
import type { PhotoProcessorOptions } from './processor.js'

export interface ProcessedImageData {
  sharpInstance: sharp.Sharp
  imageBuffer: Buffer
  metadata: { width: number; height: number }
}

export interface PhotoProcessingContext {
  photoKey: string
  obj: S3ObjectLike
  existingItem: PhotoManifestItem | undefined
  livePhotoMap: Map<string, S3ObjectLike>
  options: PhotoProcessorOptions
  pluginData: Record<string, unknown>
}

/**
 * 预处理图片数据
 * 包括获取原始数据、格式转换、BMP 处理等
 */
export async function preprocessImage(
  photoKey: string,
): Promise<{ rawBuffer: Buffer; processedBuffer: Buffer } | null> {
  const loggers = getGlobalLoggers()
  const { storageManager, prefetchedBuffers } = getPhotoExecutionContext()

  try {
    // 获取图片数据
    const rawImageBuffer = prefetchedBuffers?.get(photoKey) ?? (await storageManager.getFile(photoKey))
    if (!rawImageBuffer) {
      loggers.image.error(`无法获取图片数据：${photoKey}`)
      return null
    }

    // 预处理图片（处理 HEIC/HEIF 格式）
    let imageBuffer: Buffer
    try {
      imageBuffer = await preprocessImageBuffer(rawImageBuffer, photoKey)
    } catch (error) {
      loggers.image.error(`预处理图片失败：${photoKey}`, error)
      return null
    }

    return {
      rawBuffer: rawImageBuffer,
      processedBuffer: imageBuffer,
    }
  } catch (error) {
    loggers.image.error(`图片预处理失败：${photoKey}`, error)
    return null
  }
}

/**
 * 处理图片并创建 Sharp 实例
 * 包括 BMP 转换和元数据提取
 */
export async function processImageWithSharp(imageBuffer: Buffer, photoKey: string): Promise<ProcessedImageData | null> {
  const loggers = getGlobalLoggers()
  const { builder } = getPhotoExecutionContext()
  const { limitInputPixels } = builder.getConfig().system.processing

  try {
    // 创建 Sharp 实例，复用于多个操作
    let sharpInstance = sharp(imageBuffer, { limitInputPixels })
    let processedBuffer = imageBuffer

    // 处理 BMP
    if (isBitmap(imageBuffer)) {
      try {
        // Convert the BMP image to JPEG format and create a new Sharp instance for the converted image.
        sharpInstance = await convertBmpToJpegSharpInstance(imageBuffer)
        // Update the image buffer to reflect the new JPEG data from the Sharp instance.
        processedBuffer = await sharpInstance.toBuffer()
      } catch (error) {
        loggers.image.error(`转换 BMP 失败：${photoKey}`, error)
        return null
      }
    }

    // 获取图片元数据（复用 Sharp 实例）
    const metadata = await getImageMetadataWithSharp(sharpInstance)
    if (!metadata) {
      loggers.image.error(`获取图片元数据失败：${photoKey}`)
      return null
    }

    return {
      sharpInstance,
      imageBuffer: processedBuffer,
      metadata,
    }
  } catch (error) {
    loggers.image.error(`Sharp 处理失败：${photoKey}`, error)
    return null
  }
}

/**
 * 生成带摘要后缀的 ID
 * @param s3Key S3 键
 * @returns 带摘要后缀的 ID
 */
async function generatePhotoId(s3Key: string): Promise<string> {
  const { builder } = getPhotoExecutionContext()
  const {
    system: {
      processing: { digestSuffixLength },
    },
  } = builder.getConfig()
  if (!digestSuffixLength || digestSuffixLength <= 0) {
    return path.basename(s3Key, path.extname(s3Key))
  }

  const baseName = path.basename(s3Key, path.extname(s3Key))
  const sha256 = crypto.createHash('sha256').update(s3Key).digest('hex')
  const digestSuffix = sha256.slice(0, digestSuffixLength)
  return `${baseName}_${digestSuffix}`
}

/**
 * 完整的照片处理管道
 * 整合所有处理步骤
 */
export async function executePhotoProcessingPipeline(
  context: PhotoProcessingContext,
): Promise<PhotoManifestItem | null> {
  const { photoKey, obj, existingItem, livePhotoMap, options } = context
  const { storageManager } = getPhotoExecutionContext()
  const loggers = getGlobalLoggers()
  // Generate the actual photo ID with digest suffix
  const photoId = await generatePhotoId(photoKey)

  try {
    // 1. 预处理图片
    const imageData = await preprocessImage(photoKey)
    if (!imageData) return null

    // 2. 处理图片并创建 Sharp 实例
    const processedData = await processImageWithSharp(imageData.processedBuffer, photoKey)
    if (!processedData) return null

    const { sharpInstance, imageBuffer, metadata } = processedData
    const contentDigest = crypto.createHash('sha256').update(imageBuffer).digest('hex')

    // 3. 处理缩略图和 blurhash
    const thumbnailResult = await processThumbnailAndBlurhash(imageBuffer, photoId, existingItem, options)

    context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] = {
      photoId,
      fileName: `${photoId}.jpg`,
      buffer: thumbnailResult.thumbnailBuffer,
      localUrl: thumbnailResult.thumbnailUrl,
    }

    // 4. 处理 EXIF 数据
    const exifData = await processExifData(imageBuffer, imageData.rawBuffer, photoKey, existingItem, options)

    // 5. 检测 HDR GainMap（Ultra HDR 图片）
    const hasGainMap = detectGainMap({
      exifData: exifData as Record<string, unknown> | null,
    })

    // 6. 检测 Motion Photo（从图片中提取嵌入视频的元数据）
    const motionPhotoMetadata = detectMotionPhoto({
      rawImageBuffer: imageData.rawBuffer,
      exifData: exifData as Record<string, unknown> | null,
    })

    // 7. 处理 Live Photo（独立的视频文件）
    const livePhotoResult = await processLivePhoto(photoKey, livePhotoMap, storageManager)

    // 检测冲突：不允许同时存在 Motion Photo 和 Live Photo
    if (motionPhotoMetadata?.isMotionPhoto && livePhotoResult.isLivePhoto) {
      const errorMsg = `❌ 检测到同时存在 Motion Photo (嵌入视频) 和 Live Photo (独立视频文件)：${photoKey}。这是不允许的，请只保留一种格式。`
      loggers.image.error(errorMsg)
      throw new Error(errorMsg)
    }

    // 8. 处理影调分析
    const toneAnalysis = await processToneAnalysis(sharpInstance, photoKey, existingItem, options)

    // 9. 提取照片信息
    const photoInfo = extractPhotoInfo(photoKey, exifData)

    // 10. 构建照片清单项
    const aspectRatio = metadata.width / metadata.height
    const extension = path.extname(photoKey).slice(1).toUpperCase()
    const photoItem: PhotoManifestItem = {
      id: photoId,
      format: extension || 'UNKNOWN',
      title: photoInfo.title,
      description: photoInfo.description,
      dateTaken: photoInfo.dateTaken,
      tags: photoInfo.tags,
      originalUrl: await storageManager.generatePublicUrl(photoKey),
      thumbnailUrl: thumbnailResult.thumbnailUrl,
      thumbHash: thumbnailResult.thumbHash ? compressUint8Array(thumbnailResult.thumbHash) : null,
      width: metadata.width,
      height: metadata.height,
      aspectRatio,
      s3Key: photoKey,
      lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
      size: obj.Size || 0,
      digest: contentDigest,
      exif: exifData,
      toneAnalysis,
      location: existingItem?.location ?? null,
      // Video source (Motion Photo or Live Photo)
      video:
        motionPhotoMetadata?.isMotionPhoto && motionPhotoMetadata.motionPhotoOffset !== undefined
          ? {
              type: 'motion-photo',
              offset: motionPhotoMetadata.motionPhotoOffset,
              size: motionPhotoMetadata.motionPhotoVideoSize,
              presentationTimestamp: motionPhotoMetadata.presentationTimestampUs,
            }
          : livePhotoResult.isLivePhoto
            ? {
                type: 'live-photo',
                videoUrl: livePhotoResult.livePhotoVideoUrl!,
                s3Key: livePhotoResult.livePhotoVideoS3Key!,
              }
            : undefined,
      // HDR 相关字段
      isHDR:
        exifData?.MPImageType === 'Gain Map Image' ||
        exifData?.UniformResourceName === 'urn:iso:std:iso:ts:21496:-1' ||
        hasGainMap,
    }

    loggers.image.success(`✅ 处理完成：${photoKey}`)
    return photoItem
  } catch (error) {
    loggers.image.error(`❌ 处理管道失败：${photoKey}`, error)
    return null
  }
}

/**
 * 决定是否需要处理照片并返回处理结果
 */
export async function processPhotoWithPipeline(
  context: PhotoProcessingContext,
  runtime: { runState: PluginRunState; builderOptions: BuilderOptions },
): Promise<{
  item: PhotoManifestItem | null
  type: 'new' | 'processed' | 'skipped' | 'failed'
  pluginData: Record<string, unknown>
}> {
  const { photoKey, existingItem, obj, options } = context
  const { builder } = getPhotoExecutionContext()
  const loggers = getGlobalLoggers()

  const photoId = await generatePhotoId(photoKey)

  await builder.emitPluginEvent(runtime.runState, 'beforePhotoProcess', {
    options: runtime.builderOptions,
    context,
  })

  // 检查是否需要处理
  const { shouldProcess, reason } = await shouldProcessPhoto(photoId, existingItem, obj, options)

  if (!shouldProcess) {
    loggers.image.info(`⏭️ 跳过处理 (${reason}): ${photoKey}`)
    const result = {
      item: existingItem ?? null,
      type: 'skipped' as const,
      pluginData: context.pluginData,
    }
    await builder.emitPluginEvent(runtime.runState, 'afterPhotoProcess', {
      options: runtime.builderOptions,
      context,
      result,
    })
    return result
  }

  // 记录处理原因
  const isNewPhoto = !existingItem
  if (isNewPhoto) {
    loggers.image.info(`🆕 新照片：${photoKey}`)
  } else {
    loggers.image.info(`🔄 更新照片 (${reason})：${photoKey}`)
  }

  let processedItem: PhotoManifestItem | null = null
  let resultType: ProcessPhotoResult['type'] = isNewPhoto ? 'new' : 'processed'

  try {
    processedItem = await executePhotoProcessingPipeline(context)
    if (!processedItem) {
      resultType = 'failed'
    }
  } catch (error) {
    await builder.emitPluginEvent(runtime.runState, 'photoProcessError', {
      options: runtime.builderOptions,
      context,
      error,
    })
    loggers.image.error(`❌ 处理过程中发生异常：${photoKey}`, error)
    processedItem = null
    resultType = 'failed'
  }

  const result = {
    item: processedItem,
    type: resultType,
    pluginData: context.pluginData,
  }

  await builder.emitPluginEvent(runtime.runState, 'afterPhotoProcess', {
    options: runtime.builderOptions,
    context,
    result,
  })

  return result
}
