import path from 'node:path'

import type { BuilderConfig, PhotoManifestItem, StorageConfig, StorageObject } from '@afilmory/builder'
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_DIRECTORY as DEFAULT_THUMBNAIL_DIRECTORY,
} from '@afilmory/builder/plugins/thumbnail-storage/shared.js'
import { StorageManager } from '@afilmory/builder/storage/index.js'
import type { PhotoAssetManifest } from '@afilmory/db'
import { CURRENT_PHOTO_MANIFEST_VERSION, DATABASE_ONLY_PROVIDER, photoAssets } from '@afilmory/db'
import { EventEmitterService } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { PhotoBuilderService } from 'core/modules/photo/photo.service'
import { requireTenantContext } from 'core/modules/tenant/tenant.context'
import { and, eq, inArray, sql } from 'drizzle-orm'
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

const VIDEO_EXTENSIONS = new Set(['mov', 'mp4'])

type PreparedUploadPlan = {
  original: UploadAssetInput
  storageKey: string
  baseName: string
  isVideo: boolean
  isExisting?: boolean
}

declare module '@afilmory/framework' {
  interface Events {
    'photo.manifest.changed': { tenantId: string }
  }
}

@injectable()
export class PhotoAssetService {
  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly dbAccessor: DbAccessor,
    private readonly photoBuilderService: PhotoBuilderService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  private async emitManifestChanged(tenantId: string): Promise<void> {
    await this.eventEmitter.emit('photo.manifest.changed', { tenantId })
  }

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
    const deletedVideoKeys = new Set<string>()

    for (const record of records) {
      if (record.storageProvider !== DATABASE_ONLY_PROVIDER) {
        try {
          await storageManager.deleteFile(record.storageKey)
        } catch (error) {
          throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
            message: `无法删除存储中的文件 ${record.storageKey}: ${String(error)}`,
          })
        }

        for (const videoKey of this.deriveVideoStorageKeys(record.storageKey)) {
          if (!videoKey || videoKey === record.storageKey || deletedVideoKeys.has(videoKey)) {
            continue
          }
          try {
            await storageManager.deleteFile(videoKey)
            deletedVideoKeys.add(videoKey)
          } catch {
            // 忽略缺失的 Live Photo 视频文件
            deletedVideoKeys.add(videoKey)
          }
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
    await this.emitManifestChanged(tenant.tenant.id)
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
    const { photoPlans, videoPlans } = this.prepareUploadPlans(inputs, storageConfig)
    const unmatchedVideoBaseNames = this.validateLivePhotoPairs(photoPlans, videoPlans)

    const {
      items: existingItemsRaw,
      keySet: existingPhotoKeySet,
      baseNameMap: existingBaseNameMap,
    } = await this.collectExistingPhotoRecords(photoPlans, videoPlans, tenant.tenant.id, storageManager, db)

    const pendingPhotoPlans = photoPlans.filter((plan) => !existingPhotoKeySet.has(plan.storageKey))

    const additionalPhotoPlans = this.createExistingPhotoPlansForVideos(unmatchedVideoBaseNames, existingBaseNameMap)

    const unresolvedVideoFiles = videoPlans
      .filter((plan) => unmatchedVideoBaseNames.has(plan.baseName) && !existingBaseNameMap.has(plan.baseName))
      .map((plan) => plan.original.filename)

    if (unresolvedVideoFiles.length > 0) {
      const filenames = unresolvedVideoFiles.join(', ')
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `检测到无对应图片的 MOV 文件：${filenames}`,
      })
    }

    const allPendingPhotoPlans = [...pendingPhotoPlans, ...additionalPhotoPlans]
    if (allPendingPhotoPlans.length === 0) {
      return existingItemsRaw
    }

    const reprocessedKeys = new Set(allPendingPhotoPlans.map((plan) => plan.storageKey))
    const existingItems = existingItemsRaw.filter((item) => !reprocessedKeys.has(item.storageKey))

    const activeVideoPlans = this.selectActiveVideoPlans(allPendingPhotoPlans, videoPlans)
    const existingStorageMap = await this.buildExistingStorageMap(
      allPendingPhotoPlans,
      activeVideoPlans,
      storageManager,
    )
    const videoObjectsByBaseName = await this.prepareVideoObjects(activeVideoPlans, storageManager, existingStorageMap)

    const processedItems = await this.processPendingPhotos({
      pendingPhotoPlans: allPendingPhotoPlans,
      videoObjectsByBaseName,
      builder,
      builderConfig,
      storageManager,
      storageConfig,
      tenantId: tenant.tenant.id,
      db,
      existingStorageMap,
    })

    const result = [...existingItems, ...processedItems]

    if (processedItems.length > 0) {
      await this.emitManifestChanged(tenant.tenant.id)
    }

    return result
  }

  private prepareUploadPlans(
    inputs: readonly UploadAssetInput[],
    storageConfig: StorageConfig,
  ): { photoPlans: PreparedUploadPlan[]; videoPlans: PreparedUploadPlan[] } {
    const seenStorageKeys = new Set<string>()
    const plans: PreparedUploadPlan[] = []

    for (const input of inputs) {
      const storageKey = this.createStorageKey(input, storageConfig)
      if (seenStorageKeys.has(storageKey)) {
        continue
      }
      seenStorageKeys.add(storageKey)
      plans.push({
        original: input,
        storageKey,
        baseName: this.normalizeBaseName(storageKey),
        isVideo: this.isVideoAsset(input),
        isExisting: false,
      })
    }

    return {
      photoPlans: plans.filter((plan) => !plan.isVideo),
      videoPlans: plans.filter((plan) => plan.isVideo),
    }
  }

  private validateLivePhotoPairs(photoPlans: PreparedUploadPlan[], videoPlans: PreparedUploadPlan[]): Set<string> {
    const unmatchedBaseNames = new Set<string>()

    if (videoPlans.length === 0) {
      return unmatchedBaseNames
    }

    const photoBaseNames = new Set(photoPlans.map((plan) => plan.baseName))
    for (const plan of videoPlans) {
      if (!photoBaseNames.has(plan.baseName)) {
        unmatchedBaseNames.add(plan.baseName)
      }
    }

    return unmatchedBaseNames
  }

  private async collectExistingPhotoRecords(
    photoPlans: PreparedUploadPlan[],
    videoPlans: PreparedUploadPlan[],
    tenantId: string,
    storageManager: StorageManager,
    db: ReturnType<DbAccessor['get']>,
  ): Promise<{
    items: PhotoAssetListItem[]
    keySet: Set<string>
    baseNameMap: Map<string, typeof photoAssets.$inferSelect>
  }> {
    const recordMap = new Map<string, typeof photoAssets.$inferSelect>()
    const baseNameMap = new Map<string, typeof photoAssets.$inferSelect>()

    const photoStorageKeys = photoPlans.map((plan) => plan.storageKey)
    if (photoStorageKeys.length > 0) {
      const records = await db
        .select()
        .from(photoAssets)
        .where(and(eq(photoAssets.tenantId, tenantId), inArray(photoAssets.storageKey, photoStorageKeys)))

      for (const record of records) {
        recordMap.set(record.storageKey, record)
        baseNameMap.set(this.normalizeBaseName(record.storageKey), record)
      }
    }

    const videoBaseNames = new Set(videoPlans.map((plan) => plan.baseName))
    for (const baseName of videoBaseNames) {
      if (baseNameMap.has(baseName)) {
        continue
      }

      const pattern = `${baseName}.%`
      const [record] = await db
        .select()
        .from(photoAssets)
        .where(and(eq(photoAssets.tenantId, tenantId), sql`${photoAssets.storageKey} ILIKE ${pattern}`))
        .limit(1)

      if (record) {
        recordMap.set(record.storageKey, record)
        baseNameMap.set(this.normalizeBaseName(record.storageKey), record)
        baseNameMap.set(baseName, record)
      }
    }

    if (recordMap.size === 0) {
      return { items: [], keySet: new Set(), baseNameMap }
    }

    const records = [...recordMap.values()]
    const items = await Promise.all(
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

    return { items, keySet: new Set(recordMap.keys()), baseNameMap }
  }

  private createExistingPhotoPlansForVideos(
    unmatchedVideoBaseNames: Set<string>,
    existingBaseNameMap: Map<string, typeof photoAssets.$inferSelect>,
  ): PreparedUploadPlan[] {
    const plans: PreparedUploadPlan[] = []

    for (const baseName of unmatchedVideoBaseNames) {
      const record = existingBaseNameMap.get(baseName)
      if (!record) {
        continue
      }

      plans.push({
        original: {
          filename: path.basename(record.storageKey),
          buffer: Buffer.alloc(0),
          contentType: undefined,
        },
        storageKey: record.storageKey,
        baseName,
        isVideo: false,
        isExisting: true,
      })
    }

    return plans
  }

  private selectActiveVideoPlans(
    pendingPhotoPlans: PreparedUploadPlan[],
    videoPlans: PreparedUploadPlan[],
  ): PreparedUploadPlan[] {
    if (pendingPhotoPlans.length === 0 || videoPlans.length === 0) {
      return []
    }

    const pendingBaseNames = new Set(pendingPhotoPlans.map((plan) => plan.baseName))
    const seenVideoBaseNames = new Set<string>()
    const activePlans: PreparedUploadPlan[] = []

    for (const plan of videoPlans) {
      if (!pendingBaseNames.has(plan.baseName)) {
        continue
      }
      if (seenVideoBaseNames.has(plan.baseName)) {
        continue
      }
      seenVideoBaseNames.add(plan.baseName)
      activePlans.push(plan)
    }

    return activePlans
  }

  private async buildExistingStorageMap(
    pendingPhotoPlans: PreparedUploadPlan[],
    activeVideoPlans: PreparedUploadPlan[],
    storageManager: StorageManager,
  ): Promise<Map<string, StorageObject>> {
    const targetKeys = new Set<string>()
    for (const plan of pendingPhotoPlans) {
      targetKeys.add(plan.storageKey)
    }
    for (const plan of activeVideoPlans) {
      targetKeys.add(plan.storageKey)
    }

    if (targetKeys.size === 0) {
      return new Map()
    }

    const map = new Map<string, StorageObject>()
    const storageObjects = await storageManager.listAllFiles()
    for (const object of storageObjects) {
      if (!object.key) {
        continue
      }
      const normalizedKey = this.normalizeKeyPath(object.key)
      if (targetKeys.has(normalizedKey)) {
        map.set(normalizedKey, this.normalizeStorageObjectKey(object, normalizedKey))
      }
    }

    return map
  }

  private async prepareVideoObjects(
    activeVideoPlans: PreparedUploadPlan[],
    storageManager: StorageManager,
    existingStorageMap: Map<string, StorageObject>,
  ): Promise<Map<string, StorageObject>> {
    const result = new Map<string, StorageObject>()

    for (const plan of activeVideoPlans) {
      let storageObject = existingStorageMap.get(plan.storageKey)
      if (!storageObject) {
        storageObject = this.normalizeStorageObjectKey(
          await storageManager.uploadFile(plan.storageKey, plan.original.buffer, {
            contentType: plan.original.contentType,
          }),
          plan.storageKey,
        )
        existingStorageMap.set(plan.storageKey, storageObject)
      }

      result.set(plan.baseName, storageObject)
    }

    return result
  }

  private async processPendingPhotos(params: {
    pendingPhotoPlans: PreparedUploadPlan[]
    videoObjectsByBaseName: Map<string, StorageObject>
    builder: ReturnType<PhotoBuilderService['createBuilder']>
    builderConfig: BuilderConfig
    storageManager: StorageManager
    storageConfig: StorageConfig
    tenantId: string
    db: ReturnType<DbAccessor['get']>
    existingStorageMap: Map<string, StorageObject>
  }): Promise<PhotoAssetListItem[]> {
    const {
      pendingPhotoPlans,
      videoObjectsByBaseName,
      builder,
      builderConfig,
      storageManager,
      storageConfig,
      tenantId,
      db,
      existingStorageMap,
    } = params

    const results: PhotoAssetListItem[] = []

    for (const plan of pendingPhotoPlans) {
      let storageObject = existingStorageMap.get(plan.storageKey)
      if (!storageObject) {
        if (plan.isExisting) {
          throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
            message: `无法在存储中找到现有图片文件 ${plan.storageKey}`,
          })
        }

        storageObject = this.normalizeStorageObjectKey(
          await storageManager.uploadFile(plan.storageKey, plan.original.buffer, {
            contentType: plan.original.contentType,
          }),
          plan.storageKey,
        )
        existingStorageMap.set(plan.storageKey, storageObject)
      }

      const resolvedPhotoKey = storageObject.key ?? plan.storageKey
      const videoObject = videoObjectsByBaseName.get(plan.baseName)
      const livePhotoMap = videoObject ? new Map([[resolvedPhotoKey, videoObject]]) : undefined

      const processed = await this.photoBuilderService.processPhotoFromStorageObject(storageObject, {
        builder,
        builderConfig,
        processorOptions: {
          isForceMode: true,
          isForceManifest: true,
          isForceThumbnails: true,
        },
        livePhotoMap,
      })

      const item = processed?.item
      if (!item) {
        throw new BizException(ErrorCode.PHOTO_MANIFEST_GENERATION_FAILED, {
          message: `无法为文件 ${resolvedPhotoKey} 生成照片清单`,
        })
      }

      const manifest = this.createManifestPayload(item)
      const snapshot = this.createStorageSnapshot(storageObject)
      const now = new Date().toISOString()

      const insertPayload: typeof photoAssets.$inferInsert = {
        tenantId,
        photoId: item.id,
        storageKey: resolvedPhotoKey,
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
            .where(and(eq(photoAssets.tenantId, tenantId), eq(photoAssets.storageKey, resolvedPhotoKey)))
            .limit(1)
        )[0]

      const publicUrl = await Promise.resolve(storageManager.generatePublicUrl(resolvedPhotoKey))

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

  private deriveVideoStorageKeys(storageKey: string): string[] {
    const ext = path.extname(storageKey)
    const base = ext ? storageKey.slice(0, -ext.length) : storageKey
    if (!base) {
      return []
    }

    const variants = ['.mov', '.MOV', '.mp4', '.MP4']
    return variants.map((variant) => `${base}${variant}`)
  }

  private normalizeStorageObjectKey(object: StorageObject, fallbackKey: string): StorageObject {
    const normalizedKey = this.normalizeKeyPath(object?.key ?? fallbackKey)
    if (object?.key === normalizedKey) {
      return object
    }

    return {
      ...object,
      key: normalizedKey,
    }
  }

  private isVideoAsset(input: UploadAssetInput): boolean {
    const contentType = input.contentType?.toLowerCase() ?? ''
    if (contentType.startsWith('video/')) {
      return true
    }

    const ext = path.extname(input.filename).replace('.', '').toLowerCase()
    return VIDEO_EXTENSIONS.has(ext)
  }

  private normalizeBaseName(value: string): string {
    const ext = path.extname(value)
    const base = path.basename(value, ext)
    return base.trim().toLowerCase()
  }
}
