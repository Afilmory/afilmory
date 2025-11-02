import fs from 'node:fs/promises'
import path, { basename } from 'node:path'

import { workdir } from '@afilmory/builder/path.js'
import type { _Object } from '@aws-sdk/client-s3'

import { logger } from '../logger/index.js'
import type { AfilmoryManifest, CameraInfo, LensInfo } from '../types/manifest.js'
import type { PhotoManifestItem } from '../types/photo.js'
import { migrateManifestFileIfNeeded } from './migrate.js'
import { CURRENT_MANIFEST_VERSION } from './version.js'

const manifestPath = path.join(workdir, 'src/data/photos-manifest.json')

export async function loadExistingManifest(): Promise<AfilmoryManifest> {
  let manifest: AfilmoryManifest
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    manifest = JSON.parse(manifestContent) as AfilmoryManifest
  } catch {
    logger.fs.error('🔍 未找到 manifest 文件/解析失败，创建新的 manifest 文件...')
    await saveManifest([])
    return {
      version: CURRENT_MANIFEST_VERSION,
      data: [],
      cameras: [],
      lenses: [],
    }
  }

  if (manifest.version !== CURRENT_MANIFEST_VERSION) {
    const migrated = await migrateManifestFileIfNeeded(manifest)
    if (migrated) return migrated
  }

  // 向后兼容：如果现有 manifest 没有 cameras 和 lenses 字段，则添加空数组
  if (!manifest.cameras) {
    manifest.cameras = []
  }
  if (!manifest.lenses) {
    manifest.lenses = []
  }

  return manifest
}

// 检查照片是否需要更新（基于最后修改时间）
export function needsUpdate(existingItem: PhotoManifestItem | undefined, s3Object: _Object): boolean {
  if (!existingItem) return true
  if (!s3Object.LastModified) return true

  const existingModified = new Date(existingItem.lastModified)
  const s3Modified = s3Object.LastModified

  return s3Modified > existingModified
}

// 保存 manifest
export async function saveManifest(
  items: PhotoManifestItem[],
  cameras: CameraInfo[] = [],
  lenses: LensInfo[] = [],
): Promise<void> {
  // 按日期排序（最新的在前）
  const sortedManifest = [...items].sort((a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime())

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: CURRENT_MANIFEST_VERSION,
        data: sortedManifest,
        cameras,
        lenses,
      } as AfilmoryManifest,
      null,
      2,
    ),
  )

  logger.fs.info(`📁 Manifest 保存至： ${manifestPath}`)
  logger.fs.info(`📷 包含 ${cameras.length} 个相机，🔍 ${lenses.length} 个镜头`)
}

// 检测并处理已删除的图片
export async function handleDeletedPhotos(items: PhotoManifestItem[]): Promise<number> {
  logger.main.info('🔍 检查已删除的图片...')
  if (items.length === 0) {
    // Clear all thumbnails
    await fs.rm(path.join(workdir, 'public/thumbnails'), { recursive: true })
    logger.main.info('🔍 没有图片，清空缩略图...')
    return 0
  }

  let deletedCount = 0
  const allThumbnails = await fs.readdir(path.join(workdir, 'public/thumbnails'))

  // If thumbnails not in manifest, delete it
  const manifestKeySet = new Set(items.map((item) => item.id))

  for (const thumbnail of allThumbnails) {
    if (!manifestKeySet.has(basename(thumbnail, '.jpg'))) {
      await fs.unlink(path.join(workdir, 'public/thumbnails', thumbnail))
      deletedCount++
    }
  }

  return deletedCount
}
