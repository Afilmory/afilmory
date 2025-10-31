import path from 'node:path'

import type { BuilderConfig, PhotoManifestItem, StorageConfig, StorageObject } from '@afilmory/builder'
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_DIRECTORY as DEFAULT_THUMBNAIL_DIRECTORY,
} from '@afilmory/builder/plugins/thumbnail-storage/shared.js'
import { StorageManager } from '@afilmory/builder/storage/index.js'
import type { PhotoAssetManifest } from '@afilmory/db'
import { CURRENT_PHOTO_MANIFEST_VERSION, DATABASE_ONLY_PROVIDER, photoAssets } from '@afilmory/db'
import { BizException, ErrorCode } from 'core/errors'
import { PhotoBuilderService } from 'core/modules/photo/photo.service'
import { requireTenantContext } from 'core/modules/tenant/tenant.context'
import { and, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { PhotoStorageService } from './photo-storage.service'

type PhotoAssetRecord = typeof photoAssets.$inferSelect

const DEFAULT_THUMBNAIL_EXTENSION = {
  'image/jpeg': '.jpg',
}[DEFAULT_CONTENT_TYPE]
export interface PhotoAssetListItem {
  id: string
  photoId: string
  storageKey: string
  storageProvider: string
  manifest: PhotoAssetManifest
  syncedAt: string
  updatedAt: string
  createdAt: string
  publicUrl: string | null
  size: number | null
  syncStatus: PhotoAssetRecord['syncStatus']
}

export interface PhotoAssetSummary {
  total: number
  synced: number
  conflicts: number
  pending: number
}

export interface UploadAssetInput {
  filename: string
  buffer: Buffer
  contentType?: string
}

// const DEFAULT_THUMBNAIL_DIRECTORY = '.afilmory/thumbnails'
// const DEFAULT_THUMBNAIL_EXTENSION = '.jpg'

@injectable()
export class PhotoAssetService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly photoBuilderService: PhotoBuilderService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  async listAssets(): Promise<PhotoAssetListItem[]> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenant.tenant.id))
      .orderBy(photoAssets.createdAt)

    if (records.length === 0) {
      return []
    }

    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const storageManager = this.createStorageManager(builderConfig, storageConfig)

    return await Promise.all(
      records.map(async (record) => {
        let publicUrl: string | null = null
        if (record.storageProvider !== DATABASE_ONLY_PROVIDER) {
          try {
            publicUrl = await Promise.resolve(storageManager.generatePublicUrl(record.storageKey))
          } catch {
            publicUrl = null
          }
        }

        return {
          id: record.id,
          photoId: record.photoId,
          storageKey: record.storageKey,
          storageProvider: record.storageProvider,
          manifest: record.manifest,
          syncedAt: record.syncedAt,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt,
          publicUrl,
          size: record.size ?? null,
          syncStatus: record.syncStatus,
        }
      }),
    )
  }

  async getSummary(): Promise<PhotoAssetSummary> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({ status: photoAssets.syncStatus })
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenant.tenant.id))

    const summary = {
      total: records.length,
      synced: 0,
      conflicts: 0,
      pending: 0,
    }

    for (const record of records) {
      if (record.status === 'synced') summary.synced += 1
      else if (record.status === 'conflict') summary.conflicts += 1
      else summary.pending += 1
    }

    return summary
  }

  async deleteAssets(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return
    }

    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), inArray(photoAssets.id, ids)))

    if (records.length === 0) {
      return
    }

    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const storageManager = this.createStorageManager(builderConfig, storageConfig)
    const thumbnailRemotePrefix = this.resolveThumbnailRemotePrefix(storageConfig)
    const deletedThumbnailKeys = new Set<string>()

    for (const record of records) {
      if (record.storageProvider !== DATABASE_ONLY_PROVIDER) {
        try {
          await storageManager.deleteFile(record.storageKey)
        } catch (error) {
          throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
            message: `无法删除存储中的文件 ${record.storageKey}: ${String(error)}`,
          })
        }

        const thumbnailKey = this.resolveThumbnailStorageKey(record, thumbnailRemotePrefix)
        if (thumbnailKey && !deletedThumbnailKeys.has(thumbnailKey)) {
          try {
            await storageManager.deleteFile(thumbnailKey)
            deletedThumbnailKeys.add(thumbnailKey)
          } catch (error) {
            throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
              message: `无法删除缩略图文件 ${thumbnailKey}: ${String(error)}`,
            })
          }
        }
      }
    }

    await db.delete(photoAssets).where(and(eq(photoAssets.tenantId, tenant.tenant.id), inArray(photoAssets.id, ids)))
  }

  async uploadAssets(inputs: readonly UploadAssetInput[]): Promise<PhotoAssetListItem[]> {
    if (inputs.length === 0) {
      return []
    }

    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()
    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)

    const builder = this.photoBuilderService.createBuilder(builderConfig)
    this.photoStorageService.registerStorageProviderPlugin(builder, storageConfig)
    this.photoBuilderService.applyStorageConfig(builder, storageConfig)
    const storageManager = builder.getStorageManager()

    const results: PhotoAssetListItem[] = []

    for (const input of inputs) {
      const key = this.createStorageKey(input, storageConfig)
      const storageObject = await storageManager.uploadFile(key, input.buffer, {
        contentType: input.contentType,
      })

      const processed = await this.photoBuilderService.processPhotoFromStorageObject(storageObject, {
        builder,
        builderConfig,
        processorOptions: {
          isForceMode: true,
          isForceManifest: true,
          isForceThumbnails: true,
        },
      })

      const item = processed?.item
      if (!item) {
        throw new BizException(ErrorCode.PHOTO_MANIFEST_GENERATION_FAILED, {
          message: `无法为文件 ${key} 生成照片清单`,
        })
      }

      const manifest = this.createManifestPayload(item)
      const snapshot = this.createStorageSnapshot(storageObject)
      const now = new Date().toISOString()

      const insertPayload: typeof photoAssets.$inferInsert = {
        tenantId: tenant.tenant.id,
        photoId: item.id,
        storageKey: key,
        storageProvider: storageConfig.provider,
        size: snapshot.size ?? null,
        etag: snapshot.etag ?? null,
        lastModified: snapshot.lastModified ?? null,
        metadataHash: snapshot.metadataHash,
        manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
        manifest,
        syncStatus: 'synced',
        conflictReason: null,
        conflictPayload: null,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      }

      const [record] = await db
        .insert(photoAssets)
        .values(insertPayload)
        .onConflictDoUpdate({
          target: [photoAssets.tenantId, photoAssets.storageKey],
          set: {
            photoId: item.id,
            storageProvider: storageConfig.provider,
            size: snapshot.size ?? null,
            etag: snapshot.etag ?? null,
            lastModified: snapshot.lastModified ?? null,
            metadataHash: snapshot.metadataHash,
            manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
            manifest,
            syncStatus: 'synced',
            conflictReason: null,
            conflictPayload: null,
            syncedAt: now,
            updatedAt: now,
          },
        })
        .returning()

      const saved =
        record ??
        (
          await db
            .select()
            .from(photoAssets)
            .where(and(eq(photoAssets.tenantId, tenant.tenant.id), eq(photoAssets.storageKey, key)))
            .limit(1)
        )[0]

      const publicUrl = await Promise.resolve(storageManager.generatePublicUrl(key))

      results.push({
        id: saved.id,
        photoId: saved.photoId,
        storageKey: saved.storageKey,
        storageProvider: saved.storageProvider,
        manifest: saved.manifest,
        syncedAt: saved.syncedAt,
        updatedAt: saved.updatedAt,
        createdAt: saved.createdAt,
        publicUrl,
        size: saved.size ?? null,
        syncStatus: saved.syncStatus,
      })
    }

    return results
  }

  async generatePublicUrl(storageKey: string): Promise<string> {
    const tenant = requireTenantContext()
    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const storageManager = this.createStorageManager(builderConfig, storageConfig)
    return await Promise.resolve(storageManager.generatePublicUrl(storageKey))
  }

  private createStorageManager(builderConfig: BuilderConfig, storageConfig: StorageConfig): StorageManager {
    const builder = this.photoBuilderService.createBuilder(builderConfig)
    this.photoStorageService.registerStorageProviderPlugin(builder, storageConfig)
    this.photoBuilderService.applyStorageConfig(builder, storageConfig)
    return builder.getStorageManager()
  }

  private createStorageSnapshot(object: StorageObject) {
    const lastModified = object.lastModified ? object.lastModified.toISOString() : null
    const metadataHash = this.computeMetadataHash({
      size: object.size ?? null,
      etag: object.etag ?? null,
      lastModified,
    })

    return {
      size: object.size ?? null,
      etag: object.etag ?? null,
      lastModified,
      metadataHash,
    }
  }

  private computeMetadataHash(parts: { size: number | null; etag: string | null; lastModified: string | null }) {
    const normalizedSize = parts.size !== null ? String(parts.size) : ''
    const normalizedEtag = parts.etag ?? ''
    const normalizedLastModified = parts.lastModified ?? ''
    const digestValue = `${normalizedEtag}::${normalizedSize}::${normalizedLastModified}`
    return digestValue === '::::' ? null : digestValue
  }

  private createManifestPayload(item: PhotoManifestItem): PhotoAssetManifest {
    return {
      version: CURRENT_PHOTO_MANIFEST_VERSION,
      data: structuredClone(item),
    }
  }

  private createStorageKey(input: UploadAssetInput, storageConfig: StorageConfig): string {
    const ext = path.extname(input.filename)
    const base = path.basename(input.filename, ext).trim()

    const timestamp = Date.now().toString()
    const directory = this.resolveStorageDirectory(storageConfig)
    const keySegment = base || timestamp
    const normalized = directory ? `${directory}/${keySegment}${ext}` : `${keySegment}${ext}`
    return this.normalizeKeyPath(normalized)
  }

  private resolveStorageDirectory(storageConfig: StorageConfig): string | null {
    switch (storageConfig.provider) {
      case 's3': {
        return this.normalizeDirectory(storageConfig.prefix)
      }
      case 'github': {
        return this.normalizeDirectory(storageConfig.path)
      }
      default: {
        return null
      }
    }
  }

  private normalizeDirectory(value?: string | null): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }
    const normalized = this.normalizeKeyPath(trimmed)
    return normalized.length > 0 ? normalized : null
  }

  private normalizeKeyPath(raw: string): string {
    if (!raw) {
      return ''
    }

    const segments = raw.split(/[\\/]+/)
    const safeSegments: string[] = []

    for (const segment of segments) {
      const trimmed = segment.trim()
      if (!trimmed || trimmed === '.' || trimmed === '..') {
        continue
      }
      safeSegments.push(trimmed)
    }

    return safeSegments.join('/')
  }

  private resolveThumbnailStorageKey(record: PhotoAssetRecord, remotePrefix: string | null): string | null {
    const thumbnailUrl = record.manifest?.data?.thumbnailUrl
    if (!thumbnailUrl) {
      return null
    }

    const photoId = record.photoId ?? record.manifest?.data?.id
    if (!photoId) {
      return null
    }

    const fileName = `${photoId}${DEFAULT_THUMBNAIL_EXTENSION}`
    if (!remotePrefix) {
      return fileName
    }

    return this.joinStorageSegments(remotePrefix, fileName)
  }

  private resolveThumbnailRemotePrefix(storageConfig: StorageConfig): string | null {
    const directory = this.normalizeStorageSegment(DEFAULT_THUMBNAIL_DIRECTORY)
    if (!directory) {
      return null
    }

    if (storageConfig.provider === 's3') {
      const base = this.normalizeStorageSegment(storageConfig.prefix)
      return this.joinStorageSegments(base, directory)
    }

    if (storageConfig.provider === 'github') {
      return directory
    }

    return directory
  }

  private normalizeStorageSegment(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const normalized = trimmed.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/, '')
    return normalized.length > 0 ? normalized : null
  }

  private joinStorageSegments(...segments: Array<string | null | undefined>): string {
    const filtered: string[] = []
    for (const segment of segments) {
      if (!segment) {
        continue
      }
      filtered.push(segment.replaceAll(/^\/+|\/+$/, ''))
    }

    if (filtered.length === 0) {
      return ''
    }

    return filtered.join('/')
  }
}
