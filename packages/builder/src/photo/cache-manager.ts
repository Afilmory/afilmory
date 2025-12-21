import type { PhotoManifestItem } from '@afilmory/typing'

import { thumbnailExists } from '../image/thumbnail.js'
import type { PhotoProcessorOptions } from './processor.js'

type ThreeDSceneObjectLike = {
  Key?: string
  key?: string
} | null

function resolveThreeDSceneKey(sceneObject: ThreeDSceneObjectLike | undefined): string | undefined {
  if (!sceneObject) return undefined

  if ('Key' in sceneObject && typeof sceneObject.Key === 'string') {
    return sceneObject.Key
  }

  if ('key' in sceneObject && typeof sceneObject.key === 'string') {
    return sceneObject.key
  }

  return undefined
}

export function needsThreeDSceneUpdate(
  existingItem: PhotoManifestItem | undefined,
  sceneObject: ThreeDSceneObjectLike | undefined,
): boolean {
  const currentSceneKey = resolveThreeDSceneKey(sceneObject)
  const existingSceneKey = existingItem?.threeDScene?.s3Key

  if (!currentSceneKey && !existingSceneKey) return false
  if (currentSceneKey !== existingSceneKey) return true
  return false
}

export interface CacheableData {
  thumbnail?: {
    thumbnailUrl: string
    thumbnailBuffer: Buffer
    blurhash: string
  }
  exif?: any
  toneAnalysis?: any
}

/**
 * 检查是否需要处理照片
 * 考虑文件更新状态和缓存存在性
 */
export async function shouldProcessPhoto(
  photoId: string,
  existingItem: PhotoManifestItem | undefined,
  obj: { LastModified?: Date; ETag?: string },
  options: PhotoProcessorOptions,
  sceneObject?: ThreeDSceneObjectLike,
): Promise<{ shouldProcess: boolean; reason: string }> {
  // 强制模式下总是处理
  if (options.isForceMode) {
    return { shouldProcess: true, reason: '强制模式' }
  }

  // 新照片总是需要处理
  if (!existingItem) {
    return { shouldProcess: true, reason: '新照片' }
  }

  // 检查文件是否更新
  const fileNeedsUpdate = existingItem.lastModified !== obj.LastModified?.toISOString()

  if (fileNeedsUpdate || options.isForceManifest) {
    return {
      shouldProcess: true,
      reason: fileNeedsUpdate ? '文件已更新' : '强制更新清单',
    }
  }

  // 检查 3D 场景是否发生变化（新增/删除/替换）
  if (needsThreeDSceneUpdate(existingItem, sceneObject)) {
    return {
      shouldProcess: true,
      reason: '3D 场景更新',
    }
  }

  // 检查缩略图是否存在
  const hasThumbnail = await thumbnailExists(photoId)
  if (!hasThumbnail || options.isForceThumbnails) {
    return {
      shouldProcess: true,
      reason: options.isForceThumbnails ? '强制重新生成缩略图' : '缩略图缺失',
    }
  }

  return { shouldProcess: false, reason: '无需处理' }
}

/**
 * 检查缓存数据的完整性
 */
export function validateCacheData(
  existingItem: PhotoManifestItem | undefined,
  options: PhotoProcessorOptions,
): {
  needsThumbnail: boolean
  needsExif: boolean
  needsToneAnalysis: boolean
} {
  if (!existingItem) {
    return {
      needsThumbnail: true,
      needsExif: true,
      needsToneAnalysis: true,
    }
  }

  return {
    needsThumbnail: options.isForceMode || options.isForceThumbnails || !existingItem.thumbHash,
    needsExif: options.isForceMode || options.isForceManifest || !existingItem.exif,
    needsToneAnalysis: options.isForceMode || options.isForceManifest || !existingItem.toneAnalysis,
  }
}
