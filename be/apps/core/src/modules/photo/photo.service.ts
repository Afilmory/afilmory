import type {
  BuilderConfig,
  CameraInfo,
  LensInfo,
  PhotoManifestItem,
  PhotoProcessingContext,
  PhotoProcessorOptions,
  StorageConfig,
  StorageObject,
  StorageProvider,
} from '@afilmory/builder'
import { AfilmoryBuilder, processPhotoWithPipeline, StorageFactory, StorageManager } from '@afilmory/builder'
import { CURRENT_MANIFEST_VERSION } from '@afilmory/builder/src/manifest/version'
import type {PhotoManifestJson} from '@afilmory/db';
import { photoManifests, photos } from '@afilmory/db'
import type { _Object } from '@aws-sdk/client-s3'
import { BizException, ErrorCode } from 'core/errors'
import { logger } from 'core/helpers/logger.helper'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { SettingService } from '../setting/setting.service'
import { StorageConfigRecordSchema, StorageConfigSchema } from '../setting/storage.schema'
import { requireTenantContext } from '../tenant/tenant.context'

const DEFAULT_PROCESSOR_OPTIONS: PhotoProcessorOptions = {
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
}

export type ProcessPhotoOptions = {
  existingItem?: PhotoManifestItem
  livePhotoMap?: Map<string, StorageObject>
  processorOptions?: Partial<PhotoProcessorOptions>
  builder?: AfilmoryBuilder
}

@injectable()
export class PhotoBuilderService {
  private readonly defaultBuilder: AfilmoryBuilder

  constructor() {
    this.defaultBuilder = new AfilmoryBuilder()
  }

  getDefaultBuilder(): AfilmoryBuilder {
    return this.defaultBuilder
  }

  createBuilder(config?: Partial<BuilderConfig>): AfilmoryBuilder {
    return new AfilmoryBuilder(config)
  }

  createStorageManager(config: StorageConfig): StorageManager {
    return new StorageManager(config)
  }

  resolveStorageProvider(config: StorageConfig): StorageProvider {
    return StorageFactory.createProvider(config)
  }

  applyStorageConfig(builder: AfilmoryBuilder, config: StorageConfig): void {
    builder.getStorageManager().switchProvider(config)
  }

  async processPhotoFromStorageObject(
    object: StorageObject,
    options?: ProcessPhotoOptions,
  ): Promise<Awaited<ReturnType<typeof processPhotoWithPipeline>>> {
    const { existingItem, livePhotoMap, processorOptions, builder } = options ?? {}
    const activeBuilder = builder ?? this.defaultBuilder

    const mergedOptions: PhotoProcessorOptions = {
      ...DEFAULT_PROCESSOR_OPTIONS,
      ...processorOptions,
    }

    const context: PhotoProcessingContext = {
      photoKey: object.key,
      obj: this.toLegacyObject(object),
      existingItem,
      livePhotoMap: this.toLegacyLivePhotoMap(livePhotoMap),
      options: mergedOptions,
    }

    return await processPhotoWithPipeline(context, activeBuilder)
  }

  private toLegacyObject(object: StorageObject): _Object {
    return {
      Key: object.key,
      Size: object.size,
      LastModified: object.lastModified,
      ETag: object.etag,
    }
  }

  private toLegacyLivePhotoMap(livePhotoMap?: Map<string, StorageObject>): Map<string, _Object> {
    if (!livePhotoMap) {
      return new Map()
    }

    const result = new Map<string, _Object>()

    for (const [key, value] of livePhotoMap) {
      result.set(key, this.toLegacyObject(value))
    }

    return result
  }
}

type ListPhotosOptions = {
  page?: number
  limit?: number
  tenantId?: string
}

type SyncOptions = {
  tenantId?: string
}

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100

type PhotoRow = typeof photos.$inferSelect

type SyncSummary = {
  provider: StorageConfig['provider']
  summary: {
    inserted: number
    updated: number
    skipped: number
    deleted: number
    failed: number
    total: number
    durationMs: number
  }
  manifest: {
    version: string
    totalPhotos: number
    cameras: CameraInfo[]
    lenses: LensInfo[]
    syncedAt: string
  }
}

type ListPhotosResult = {
  data: Array<ReturnType<PhotoService['mapPhotoRow']>>
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type ManifestSummaryResult = {
  provider: StorageConfig['provider'] | null
  manifest: SyncSummary['manifest'] | null
}

@injectable()
export class PhotoService {
  private readonly log = logger.extend('PhotoService')

  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly photoBuilder: PhotoBuilderService,
    private readonly settingService: SettingService,
  ) {}

  async syncFromActiveStorage(options?: SyncOptions): Promise<SyncSummary> {
    const startedAt = Date.now()
    const tenantId = this.resolveTenantId(options)

    const config = await this.resolveActiveStorageConfig(tenantId)
    this.log.info(`Syncing photos using provider: ${config.provider}`)

    const builder = this.photoBuilder.createBuilder({ storage: config })
    const storageManager = builder.getStorageManager()

    const db = this.dbAccessor.get()
    const existingRecords = await db.select().from(photos).where(eq(photos.tenantId, tenantId))

    const existingByKey = new Map(existingRecords.map((record) => [record.storageKey, record]))

    const allObjects = await storageManager.listAllFiles()
    const livePhotoMap = await storageManager.detectLivePhotos(allObjects)
    const imageObjects = await storageManager.listImages()

    const storageKeys = new Set(imageObjects.map((item) => item.key))
    const toDeleteKeys = existingRecords
      .filter((record) => !storageKeys.has(record.storageKey))
      .map((record) => record.storageKey)

    const manifestItems: PhotoManifestItem[] = []
    const upsertPayloads: Array<typeof photos.$inferInsert> = []

    let inserted = 0
    let updated = 0
    let skipped = 0
    let failed = 0

    const syncedAt = new Date().toISOString()

    for (const object of imageObjects) {
      if (!object.key) {
        continue
      }

      const existingRecord = existingByKey.get(object.key)
      const existingItem = existingRecord?.manifest
        ? this.normalizeManifestItem(existingRecord.manifest as PhotoManifestItem)
        : undefined

      const result = await this.photoBuilder.processPhotoFromStorageObject(object, {
        existingItem,
        livePhotoMap,
        builder,
      })

      if (!result.item) {
        failed += 1
        if (existingItem) {
          manifestItems.push(existingItem)
        }
        continue
      }

      const normalized = this.normalizeManifestItem(result.item)
      manifestItems.push(normalized)

      switch (result.type) {
        case 'new': {
          inserted += 1
          break
        }
        case 'processed': {
          updated += 1
          break
        }
        case 'skipped': {
          skipped += 1
          break
        }
        default: {
          break
        }
      }

      upsertPayloads.push(
        this.createPhotoRecordPayload({
          manifest: normalized,
          tenantId,
          syncedAt,
        }),
      )
    }

    if (upsertPayloads.length > 0) {
      await db
        .insert(photos)
        .values(upsertPayloads)
        .onConflictDoUpdate({
          target: [photos.tenantId, photos.id],
          set: {
            storageKey: sql`excluded.storage_key`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            dateTaken: sql`excluded.date_taken`,
            tags: sql`excluded.tags`,
            originalUrl: sql`excluded.original_url`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            thumbHash: sql`excluded.thumb_hash`,
            width: sql`excluded.width`,
            height: sql`excluded.height`,
            aspectRatio: sql`excluded.aspect_ratio`,
            size: sql`excluded.size`,
            lastModified: sql`excluded.last_modified`,
            manifest: sql`excluded.manifest`,
            exif: sql`excluded.exif`,
            toneAnalysis: sql`excluded.tone_analysis`,
            isLivePhoto: sql`excluded.is_live_photo`,
            isHdr: sql`excluded.is_hdr`,
            livePhotoVideoUrl: sql`excluded.live_photo_video_url`,
            livePhotoVideoKey: sql`excluded.live_photo_video_key`,
            syncedAt: sql`excluded.synced_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
    }

    let deleted = 0
    if (toDeleteKeys.length > 0) {
      await db.delete(photos).where(and(eq(photos.tenantId, tenantId), inArray(photos.storageKey, toDeleteKeys)))
      deleted = toDeleteKeys.length
    }

    manifestItems.sort((a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime())

    const manifestSummary = {
      version: CURRENT_MANIFEST_VERSION,
      totalPhotos: manifestItems.length,
      cameras: this.generateCameraCollection(manifestItems),
      lenses: this.generateLensCollection(manifestItems),
      syncedAt,
    }

    await db
      .insert(photoManifests)
      .values({
        tenantId,
        provider: config.provider,
        version: manifestSummary.version,
        totalPhotos: manifestSummary.totalPhotos,
        cameras: manifestSummary.cameras,
        lenses: manifestSummary.lenses,
        syncedAt: manifestSummary.syncedAt,
        updatedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: photoManifests.tenantId,
        set: {
          provider: sql`excluded.provider`,
          version: sql`excluded.version`,
          totalPhotos: sql`excluded.total_photos`,
          cameras: sql`excluded.cameras`,
          lenses: sql`excluded.lenses`,
          syncedAt: sql`excluded.synced_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })

    const durationMs = Date.now() - startedAt
    this.log.info(`Sync completed for tenant ${tenantId}: ${manifestSummary.totalPhotos} photos processed`)

    return {
      provider: config.provider,
      summary: {
        inserted,
        updated,
        skipped,
        deleted,
        failed,
        total: manifestSummary.totalPhotos,
        durationMs,
      },
      manifest: manifestSummary,
    }
  }

  async listPhotos(options?: ListPhotosOptions): Promise<ListPhotosResult> {
    const tenantId = this.resolveTenantId(options)
    const page = Math.max(options?.page ?? 1, 1)
    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const offset = (page - 1) * limit

    const db = this.dbAccessor.get()

    const [{ value: totalValue } = { value: 0 }] = await db
      .select({ value: count() })
      .from(photos)
      .where(eq(photos.tenantId, tenantId))

    const rows = await db
      .select()
      .from(photos)
      .where(eq(photos.tenantId, tenantId))
      .orderBy(desc(photos.dateTaken), desc(photos.syncedAt))
      .limit(limit)
      .offset(offset)

    const total = Number(totalValue ?? 0)
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1

    return {
      data: rows.map((row) => this.mapPhotoRow(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    }
  }

  async getManifestSummary(options?: SyncOptions): Promise<ManifestSummaryResult> {
    const tenantId = this.resolveTenantId(options)
    const db = this.dbAccessor.get()

    const [record] = await db.select().from(photoManifests).where(eq(photoManifests.tenantId, tenantId)).limit(1)

    const activeProvider = await this.settingService.get('storage.activeProvider', {
      tenantId,
    })

    if (!record) {
      return {
        provider: (activeProvider as StorageConfig['provider']) ?? null,
        manifest: null,
      }
    }

    return {
      provider: (activeProvider as StorageConfig['provider']) ?? record.provider,
      manifest: {
        version: record.version,
        totalPhotos: record.totalPhotos,
        cameras: record.cameras as CameraInfo[],
        lenses: record.lenses as LensInfo[],
        syncedAt: record.syncedAt,
      },
    }
  }

  private resolveTenantId(options?: { tenantId?: string }): string {
    if (options?.tenantId) {
      return options.tenantId
    }

    const context = requireTenantContext()
    return context.tenant.id
  }

  private normalizeManifestItem(item: PhotoManifestItem): PhotoManifestItem {
    return {
      ...item,
      tags: Array.isArray(item.tags) ? item.tags : [],
      description: item.description ?? '',
      thumbHash: item.thumbHash ?? null,
      isLivePhoto: item.isLivePhoto ?? false,
      isHDR: item.isHDR ?? false,
      livePhotoVideoUrl: item.livePhotoVideoUrl ?? undefined,
      livePhotoVideoS3Key: item.livePhotoVideoS3Key ?? undefined,
      toneAnalysis: item.toneAnalysis ?? null,
      exif: item.exif ?? null,
    }
  }

  private createPhotoRecordPayload({
    manifest,
    tenantId,
    syncedAt,
  }: {
    manifest: PhotoManifestItem
    tenantId: string
    syncedAt: string
  }): typeof photos.$inferInsert {
    const manifestJson: PhotoManifestJson = {
      ...manifest,
      tags: manifest.tags,
      thumbHash: manifest.thumbHash ?? null,
      isLivePhoto: manifest.isLivePhoto ?? false,
      isHDR: manifest.isHDR ?? false,
      livePhotoVideoUrl: manifest.livePhotoVideoUrl ?? null,
      livePhotoVideoS3Key: manifest.livePhotoVideoS3Key ?? null,
      toneAnalysis: manifest.toneAnalysis ?? null,
      exif: manifest.exif ?? null,
    }

    return {
      tenantId,
      id: manifest.id,
      storageKey: manifest.s3Key,
      title: manifest.title,
      description: manifest.description ?? '',
      dateTaken: manifest.dateTaken,
      tags: manifest.tags,
      originalUrl: manifest.originalUrl,
      thumbnailUrl: manifest.thumbnailUrl,
      thumbHash: manifest.thumbHash ?? null,
      width: manifest.width,
      height: manifest.height,
      aspectRatio: manifest.aspectRatio,
      size: manifest.size,
      lastModified: manifest.lastModified,
      manifest: manifestJson,
      exif: manifestJson.exif,
      toneAnalysis: manifestJson.toneAnalysis,
      isLivePhoto: manifest.isLivePhoto ?? false,
      isHdr: manifest.isHDR ?? false,
      livePhotoVideoUrl: manifestJson.livePhotoVideoUrl ?? null,
      livePhotoVideoKey: manifestJson.livePhotoVideoS3Key ?? null,
      syncedAt,
      updatedAt: syncedAt,
    }
  }

  private mapPhotoRow(row: PhotoRow) {
    const manifest = this.normalizeManifestItem(row.manifest as unknown as PhotoManifestItem)

    return {
      id: row.id,
      storageKey: row.storageKey,
      title: row.title,
      description: row.description,
      dateTaken: row.dateTaken,
      tags: row.tags,
      originalUrl: row.originalUrl,
      thumbnailUrl: row.thumbnailUrl,
      thumbHash: row.thumbHash ?? null,
      width: row.width,
      height: row.height,
      aspectRatio: row.aspectRatio,
      size: row.size,
      lastModified: row.lastModified,
      isLivePhoto: row.isLivePhoto,
      isHdr: row.isHdr,
      livePhotoVideoUrl: row.livePhotoVideoUrl,
      livePhotoVideoKey: row.livePhotoVideoKey,
      toneAnalysis: row.toneAnalysis,
      exif: row.exif,
      syncedAt: row.syncedAt,
      updatedAt: row.updatedAt,
      manifest,
    }
  }

  private generateCameraCollection(manifest: PhotoManifestItem[]): CameraInfo[] {
    const cameraMap = new Map<string, CameraInfo>()

    for (const photo of manifest) {
      const make = photo.exif?.Make?.trim()
      const model = photo.exif?.Model?.trim()

      if (!make || !model) {
        continue
      }

      const displayName = `${make} ${model}`
      if (!cameraMap.has(displayName)) {
        cameraMap.set(displayName, {
          make,
          model,
          displayName,
        })
      }
    }

    return Array.from(cameraMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private generateLensCollection(manifest: PhotoManifestItem[]): LensInfo[] {
    const lensMap = new Map<string, LensInfo>()

    for (const photo of manifest) {
      const lensModel = photo.exif?.LensModel?.trim()
      if (!lensModel) {
        continue
      }

      const lensMake = photo.exif?.LensMake?.trim()
      const displayName = lensMake ? `${lensMake} ${lensModel}` : lensModel

      if (!lensMap.has(displayName)) {
        lensMap.set(displayName, {
          make: lensMake,
          model: lensModel,
          displayName,
        })
      }
    }

    return Array.from(lensMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private async resolveActiveStorageConfig(tenantId: string): Promise<StorageConfig> {
    const activeProvider = await this.settingService.get('storage.activeProvider', {
      tenantId,
    })

    if (!activeProvider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Active storage provider is not configured',
      })
    }

    const providerConfigsRaw = await this.settingService.get('storage.providerConfigs', {
      tenantId,
    })

    let config: StorageConfig | null = null

    if (providerConfigsRaw) {
      const configs = this.parseConfigRecord(providerConfigsRaw)
      const matched = configs[activeProvider]
      if (matched) {
        config = matched as StorageConfig
      }
    }

    if (!config) {
      const singleConfigRaw = await this.settingService.get('storage.providerConfig', {
        tenantId,
      })

      if (singleConfigRaw) {
        const parsed = this.parseConfig(singleConfigRaw)
        if (parsed.provider === activeProvider) {
          config = parsed as StorageConfig
        }
      }
    }

    if (!config) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `Storage provider "${activeProvider}" is not configured`,
      })
    }

    return config
  }

  private parseConfigRecord(raw: string) {
    try {
      const parsed = JSON.parse(raw)
      const result = StorageConfigRecordSchema.safeParse(parsed)
      if (!result.success) {
        throw result.error
      }
      return result.data
    } catch (error) {
      this.log.error('Failed to parse storage provider configuration map', error)
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Invalid storage provider configuration',
        cause: error,
      })
    }
  }

  private parseConfig(raw: string) {
    try {
      const parsed = JSON.parse(raw)
      const result = StorageConfigSchema.safeParse(parsed)
      if (!result.success) {
        throw result.error
      }
      return result.data
    } catch (error) {
      this.log.error('Failed to parse storage provider configuration', error)
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Invalid storage provider configuration',
        cause: error,
      })
    }
  }
}
