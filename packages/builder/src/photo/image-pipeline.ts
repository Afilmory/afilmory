import type { _Object } from '@aws-sdk/client-s3'
import sharp from 'sharp'

import { defaultBuilder } from '../builder/builder.js'
import {
  convertBmpToJpegSharpInstance,
  getImageMetadataWithSharp,
  isBitmap,
  preprocessImageBuffer,
} from '../image/processor.js'
import { compressUint8Array } from '../lib/u8array.js'
import type { PhotoManifestItem } from '../types/photo.js'
import { shouldProcessPhoto } from './cache-manager.js'
import {
  processExifData,
  processThumbnailAndBlurhash,
  processToneAnalysis,
} from './data-processors.js'
import { extractPhotoInfo } from './info-extractor.js'
import { processLivePhoto } from './live-photo-handler.js'
import { getGlobalLoggers } from './logger-adapter.js'
import type { PhotoProcessorOptions } from './processor.js'

export interface ProcessedImageData {
  sharpInstance: sharp.Sharp
  imageBuffer: Buffer
  metadata: { width: number; height: number }
}

export interface PhotoProcessingContext {
  photoKey: string
  photoId: string
  obj: _Object
  existingItem: PhotoManifestItem | undefined
  livePhotoMap: Map<string, _Object>
  options: PhotoProcessorOptions
}

/**
 * 预处理图片数据
 * 包括获取原始数据、格式转换、BMP 处理等
 */
export async function preprocessImage(
  photoKey: string,
): Promise<{ rawBuffer: Buffer; processedBuffer: Buffer } | null> {
  const loggers = getGlobalLoggers()

  try {
    // 获取图片数据
    const rawImageBuffer = await defaultBuilder
      .getStorageManager()
      .getFile(photoKey)
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
export async function processImageWithSharp(
  imageBuffer: Buffer,
  photoKey: string,
): Promise<ProcessedImageData | null> {
  const loggers = getGlobalLoggers()

  try {
    // 创建 Sharp 实例，复用于多个操作
    let sharpInstance = sharp(imageBuffer)
    let processedBuffer = imageBuffer

    // 处理 BMP
    if (isBitmap(imageBuffer)) {
      try {
        // Convert the BMP image to JPEG format and create a new Sharp instance for the converted image.
        sharpInstance = await convertBmpToJpegSharpInstance(
          imageBuffer,
          loggers.image.originalLogger,
        )
        // Update the image buffer to reflect the new JPEG data from the Sharp instance.
        processedBuffer = await sharpInstance.toBuffer()
      } catch (error) {
        loggers.image.error(`转换 BMP 失败：${photoKey}`, error)
        return null
      }
    }

    // 获取图片元数据（复用 Sharp 实例）
    const metadata = await getImageMetadataWithSharp(
      sharpInstance,
      loggers.image.originalLogger,
    )
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
 * 完整的照片处理管道
 * 整合所有处理步骤
 */
export async function executePhotoProcessingPipeline(
  context: PhotoProcessingContext,
): Promise<PhotoManifestItem | null> {
  const { photoKey, photoId, obj, existingItem, livePhotoMap, options } =
    context
  const loggers = getGlobalLoggers()

  try {
    // 1. 预处理图片
    const imageData = await preprocessImage(photoKey)
    if (!imageData) return null

    // 2. 处理图片并创建 Sharp 实例
    const processedData = await processImageWithSharp(
      imageData.processedBuffer,
      photoKey,
    )
    if (!processedData) return null

    const { sharpInstance, imageBuffer, metadata } = processedData

    // 3. 处理缩略图和 blurhash
    const thumbnailResult = await processThumbnailAndBlurhash(
      imageBuffer,
      photoId,
      existingItem,
      options,
    )

    // 4. 处理 EXIF 数据
    const exifData = await processExifData(
      imageBuffer,
      imageData.rawBuffer,
      photoKey,
      existingItem,
      options,
    )

    // 5. 处理影调分析
    const toneAnalysis = await processToneAnalysis(
      sharpInstance,
      photoKey,
      existingItem,
      options,
    )

    // 6. 提取照片信息
    const photoInfo = extractPhotoInfo(photoKey, exifData)

    // 7. 处理 Live Photo
    const livePhotoResult = processLivePhoto(photoKey, livePhotoMap)

    // 8. 构建照片清单项
    const aspectRatio = metadata.width / metadata.height

    const photoItem: PhotoManifestItem = {
      id: photoId,
      title: photoInfo.title,
      description: photoInfo.description,
      dateTaken: photoInfo.dateTaken,
      tags: photoInfo.tags,
      originalUrl: defaultBuilder
        .getStorageManager()
        .generatePublicUrl(photoKey),
      thumbnailUrl: thumbnailResult.thumbnailUrl,
      thumbHash: thumbnailResult.thumbHash
        ? compressUint8Array(thumbnailResult.thumbHash)
        : null,
      width: metadata.width,
      height: metadata.height,
      aspectRatio,
      s3Key: photoKey,
      lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
      size: obj.Size || 0,
      exif: exifData,
      toneAnalysis,
      // Live Photo 相关字段
      isLivePhoto: livePhotoResult.isLivePhoto,
      livePhotoVideoUrl: livePhotoResult.livePhotoVideoUrl,
      livePhotoVideoS3Key: livePhotoResult.livePhotoVideoS3Key,
      // HDR 相关字段
      isHDR: exifData?.MPImageType === 'Gain Map Image',
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
): Promise<{
  item: PhotoManifestItem | null
  type: 'new' | 'processed' | 'skipped' | 'failed'
}> {
  const { photoKey, existingItem, obj, options } = context
  const loggers = getGlobalLoggers()

  // 检查是否需要处理
  const { shouldProcess, reason } = await shouldProcessPhoto(
    photoKey,
    existingItem,
    obj,
    options,
  )

  if (!shouldProcess) {
    loggers.image.info(`⏭️ 跳过处理 (${reason}): ${photoKey}`)
    return { item: existingItem!, type: 'skipped' }
  }

  // 记录处理原因
  const isNewPhoto = !existingItem
  if (isNewPhoto) {
    loggers.image.info(`🆕 新照片：${photoKey}`)
  } else {
    loggers.image.info(`🔄 更新照片 (${reason})：${photoKey}`)
  }

  // 执行处理管道
  const processedItem = await executePhotoProcessingPipeline(context)

  if (!processedItem) {
    return { item: null, type: 'failed' }
  }

  return {
    item: processedItem,
    type: isNewPhoto ? 'new' : 'processed',
  }
}
