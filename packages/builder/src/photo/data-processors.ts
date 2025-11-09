import fs from 'node:fs/promises'
import path from 'node:path'

import { decompressUint8Array } from '@afilmory/utils'
import type sharp from 'sharp'

import { HEIC_FORMATS } from '../constants/index.js'
import { extractExifData } from '../image/exif.js'
import { calculateHistogramAndAnalyzeTone } from '../image/histogram.js'
import { generateThumbnailAndBlurhash, thumbnailExists } from '../image/thumbnail.js'
import { workdir } from '../path.js'
import type { PhotoManifestItem, PickedExif, ToneAnalysis } from '../types/photo.js'
import { getGlobalLoggers } from './logger-adapter.js'
import type { PhotoProcessorOptions } from './processor.js'

export interface ThumbnailResult {
  thumbnailUrl: string
  thumbnailBuffer: Buffer
  thumbHash: Uint8Array | null
}

/**
 * 处理缩略图和 blurhash
 * 优先复用现有数据，如果不存在或需要强制更新则重新生成
 */
export async function processThumbnailAndBlurhash(
  imageBuffer: Buffer,
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): Promise<ThumbnailResult> {
  const loggers = getGlobalLoggers()

  // 检查是否可以复用现有数据
  if (
    !options.isForceMode &&
    !options.isForceThumbnails &&
    existingItem?.thumbHash &&
    (await thumbnailExists(photoId))
  ) {
    try {
      const thumbnailPath = path.join(workdir, 'public/thumbnails', `${photoId}.jpg`)
      const thumbnailBuffer = await fs.readFile(thumbnailPath)
      const thumbnailUrl = `/thumbnails/${photoId}.jpg`

      loggers.blurhash.info(`复用现有 blurhash: ${photoId}`)
      loggers.thumbnail.info(`复用现有缩略图：${photoId}`)

      return {
        thumbnailUrl,
        thumbnailBuffer,
        thumbHash: decompressUint8Array(existingItem.thumbHash),
      }
    } catch (error) {
      loggers.thumbnail.warn(`读取现有缩略图失败，重新生成：${photoId}`, error)
      // 继续执行生成逻辑
    }
  }

  // 生成新的缩略图和 blurhash
  const result = await generateThumbnailAndBlurhash(
    imageBuffer,
    photoId,
    options.isForceMode || options.isForceThumbnails,
  )

  return {
    thumbnailUrl: result.thumbnailUrl!,
    thumbnailBuffer: result.thumbnailBuffer!,
    thumbHash: result.thumbHash!,
  }
}

/**
 * 处理 EXIF 数据
 * 优先复用现有数据，如果不存在或需要强制更新则重新提取
 */
export async function processExifData(
  imageBuffer: Buffer,
  rawImageBuffer: Buffer | undefined,
  photoKey: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): Promise<PickedExif | null> {
  const loggers = getGlobalLoggers()

  // 检查是否可以复用现有数据
  if (!options.isForceMode && !options.isForceManifest && existingItem?.exif) {
    const photoId = path.basename(photoKey, path.extname(photoKey))
    loggers.exif.info(`复用现有 EXIF 数据：${photoId}`)
    return existingItem.exif
  }

  // 提取新的 EXIF 数据
  const ext = path.extname(photoKey).toLowerCase()
  const originalBuffer = HEIC_FORMATS.has(ext) ? rawImageBuffer : undefined

  return await extractExifData(imageBuffer, originalBuffer)
}

/**
 * 处理影调分析
 * 优先复用现有数据，如果不存在或需要强制更新则重新计算
 */
export async function processToneAnalysis(
  sharpInstance: sharp.Sharp,
  photoKey: string,
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): Promise<ToneAnalysis | null> {
  const loggers = getGlobalLoggers()

  // 检查是否可以复用现有数据
  if (!options.isForceMode && !options.isForceManifest && existingItem?.toneAnalysis) {
    const photoId = path.basename(photoKey, path.extname(photoKey))
    loggers.tone.info(`复用现有影调分析：${photoId}`)
    return existingItem.toneAnalysis
  }

  // 计算新的影调分析
  return await calculateHistogramAndAnalyzeTone(sharpInstance)
}
