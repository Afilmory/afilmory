import fs from 'node:fs/promises'
import path from 'node:path'

import { workdir } from '@afilmory/builder/path.js'
import sharp from 'sharp'

import { getGlobalLoggers } from '../photo/logger-adapter.js'
import type { ThumbnailResult } from '../types/photo.js'
import { generateBlurhash } from './blurhash.js'

// 常量定义
const THUMBNAIL_DIR = path.join(workdir, 'public/thumbnails')
const THUMBNAIL_QUALITY = 100
const THUMBNAIL_WIDTH = 600

// 获取缩略图路径信息
function getThumbnailPaths(photoId: string) {
  const filename = `${photoId}.jpg`
  const thumbnailPath = path.join(THUMBNAIL_DIR, filename)
  const thumbnailUrl = `/thumbnails/${filename}`

  return { thumbnailPath, thumbnailUrl }
}

// 创建失败结果
function createFailureResult(): ThumbnailResult {
  return {
    thumbnailUrl: null,
    thumbnailBuffer: null,
    thumbHash: null,
  }
}

// 创建成功结果
function createSuccessResult(
  thumbnailUrl: string,
  thumbnailBuffer: Buffer,
  thumbHash: Uint8Array | null,
): ThumbnailResult {
  return {
    thumbnailUrl,
    thumbnailBuffer,
    thumbHash,
  }
}

// 确保缩略图目录存在
async function ensureThumbnailDir(): Promise<void> {
  await fs.mkdir(THUMBNAIL_DIR, { recursive: true })
}

// 检查缩略图是否存在
export async function thumbnailExists(photoId: string): Promise<boolean> {
  try {
    const { thumbnailPath } = getThumbnailPaths(photoId)
    await fs.access(thumbnailPath)
    return true
  } catch {
    return false
  }
}

// 读取现有缩略图并生成 blurhash
async function processExistingThumbnail(photoId: string): Promise<ThumbnailResult | null> {
  const { thumbnailPath, thumbnailUrl } = getThumbnailPaths(photoId)

  const thumbnailLog = getGlobalLoggers().thumbnail
  thumbnailLog.info(`复用现有缩略图：${photoId}`)

  try {
    const existingBuffer = await fs.readFile(thumbnailPath)
    const thumbHash = await generateBlurhash(existingBuffer)

    return createSuccessResult(thumbnailUrl, existingBuffer, thumbHash)
  } catch (error) {
    thumbnailLog?.warn(`读取现有缩略图失败，重新生成：${photoId}`, error)
    return null
  }
}

// 生成新的缩略图
async function generateNewThumbnail(imageBuffer: Buffer, photoId: string): Promise<ThumbnailResult> {
  const { thumbnailPath, thumbnailUrl } = getThumbnailPaths(photoId)

  const log = getGlobalLoggers().thumbnail
  log.info(`生成缩略图：${photoId}`)
  const startTime = Date.now()

  try {
    // 创建 Sharp 实例，复用于缩略图和 blurhash 生成
    const sharpInstance = sharp(imageBuffer).rotate() // 自动根据 EXIF 旋转

    // 生成缩略图
    const thumbnailBuffer = await sharpInstance
      .clone() // 克隆实例用于缩略图生成
      .resize(THUMBNAIL_WIDTH, null, {
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer()

    // 保存到文件
    await fs.writeFile(thumbnailPath, thumbnailBuffer)

    // 记录生成信息
    const duration = Date.now() - startTime
    const sizeKB = Math.round(thumbnailBuffer.length / 1024)
    log.success(`生成完成：${photoId} (${sizeKB}KB, ${duration}ms)`)

    // 基于生成的缩略图生成 blurhash
    const thumbHash = await generateBlurhash(thumbnailBuffer)

    return createSuccessResult(thumbnailUrl, thumbnailBuffer, thumbHash)
  } catch (error) {
    log.error(`生成失败：${photoId}`, error)
    return createFailureResult()
  }
}

// 生成缩略图和 blurhash（复用 Sharp 实例）
export async function generateThumbnailAndBlurhash(
  imageBuffer: Buffer,
  photoId: string,
  forceRegenerate = false,
): Promise<ThumbnailResult> {
  const thumbnailLog = getGlobalLoggers().thumbnail

  try {
    await ensureThumbnailDir()

    // 如果不是强制模式且缩略图已存在，尝试复用现有文件
    if (!forceRegenerate && (await thumbnailExists(photoId))) {
      const existingResult = await processExistingThumbnail(photoId)

      if (existingResult) {
        return existingResult
      }
      // 如果处理现有缩略图失败，继续生成新的
    }

    // 生成新的缩略图
    return await generateNewThumbnail(imageBuffer, photoId)
  } catch (error) {
    thumbnailLog.error(`处理失败：${photoId}`, error)
    return createFailureResult()
  }
}
