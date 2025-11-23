import path from 'node:path'

import type { BuilderConfig, PhotoManifestItem, StorageConfig, StorageObject } from '@afilmory/builder'
import { createStorageKeyNormalizer } from '@afilmory/builder/photo/index.js'
import {
  DEFAULT_CONTENT_TYPE,
  DEFAULT_DIRECTORY as DEFAULT_THUMBNAIL_DIRECTORY,
} from '@afilmory/builder/plugins/thumbnail-storage/shared.js'
import { StorageManager } from '@afilmory/builder/storage/index.js'
import type { GitHubConfig, ManagedStorageConfig, S3Config } from '@afilmory/builder/storage/interfaces.js'
import { CURRENT_PHOTO_MANIFEST_VERSION, DATABASE_ONLY_PROVIDER, photoAssets } from '@afilmory/db'
import { EventEmitterService } from '@afilmory/framework'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { runWithBuilderLogRelay } from 'core/modules/infrastructure/data-sync/builder-log-relay'
import type {
  DataSyncAction,
  DataSyncLogLevel,
  DataSyncProgressEmitter,
  DataSyncProgressEvent,
  DataSyncResultSummary,
  DataSyncStageTotals,
} from 'core/modules/infrastructure/data-sync/data-sync.types'
import { BILLING_USAGE_EVENT } from 'core/modules/platform/billing/billing.constants'
import { BillingPlanService } from 'core/modules/platform/billing/billing-plan.service'
import { BillingUsageService } from 'core/modules/platform/billing/billing-usage.service'
import { StoragePlanService } from 'core/modules/platform/billing/storage-plan.service'
import { ManagedStorageService } from 'core/modules/platform/managed-storage/managed-storage.service'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { PhotoBuilderService } from '../builder/photo-builder.service'
import { PhotoStorageService } from '../storage/photo-storage.service'
import { TransactionalStorageManager } from '../storage/transactional-storage.manager'
import type {
  PhotoAssetListItem,
  PhotoAssetManifest,
  PhotoAssetRecord,
  PhotoAssetSummary,
  UploadAssetInput,
} from './photo-asset.types'
import { inferContentTypeFromKey } from './storage.utils'

const DEFAULT_THUMBNAIL_EXTENSION = {
  'image/jpeg': '.jpg',
}[DEFAULT_CONTENT_TYPE]

const VIDEO_EXTENSIONS = new Set(['mov', 'mp4'])

type PreparedUploadPlan = {
  original: UploadAssetInput
  storageKey: string
  baseName: string
  groupKey?: string
  isVideo: boolean
  isExisting?: boolean
}

type UploadAssetsOptions = {
  progress?: DataSyncProgressEmitter
  abortSignal?: AbortSignal
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
    private readonly billingPlanService: BillingPlanService,
    private readonly billingUsageService: BillingUsageService,
    private readonly storagePlanService: StoragePlanService,
    private readonly managedStorageService: ManagedStorageService,
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
    const storageManager = await this.createStorageManager(builderConfig, storageConfig)

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

  async getUploadSizeLimitBytes(): Promise<number | null> {
    const tenant = requireTenantContext()
    const planQuota = await this.billingPlanService.getQuotaForTenant(tenant.tenant.id)
    return this.convertMbToBytes(planQuota.maxUploadSizeMb)
  }

  async isManagedStorage(): Promise<boolean> {
    const tenant = requireTenantContext()
    const { storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    return storageConfig.provider === 'managed'
  }

  async findPhotosByIds(photoIds: string[]): Promise<PhotoManifestItem[]> {
    if (photoIds.length === 0) {
      return []
    }

    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select({
        photoId: photoAssets.photoId,
        manifest: photoAssets.manifest,
      })
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), inArray(photoAssets.photoId, photoIds)))

    return records.map((record) => record.manifest.data)
  }

  async deleteAssets(ids: readonly string[], options?: { deleteFromStorage?: boolean }): Promise<void> {
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

    const shouldDeleteFromStorage = options?.deleteFromStorage === true
    let storageConfigForDeletion: StorageConfig | null = null
    let managedProviderKey: string | null = null
    const managedKeysToDelete = new Set<string>()

    if (shouldDeleteFromStorage) {
      const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
      storageConfigForDeletion = storageConfig
      managedProviderKey = this.resolveManagedProviderKey(storageConfig)
      const storageManager = await this.createStorageManager(builderConfig, storageConfig)
      const thumbnailRemotePrefix = this.resolveThumbnailRemotePrefix(storageConfig)
      const deletedThumbnailKeys = new Set<string>()
      const deletedVideoKeys = new Set<string>()

      for (const record of records) {
        if (record.storageProvider === DATABASE_ONLY_PROVIDER) {
          continue
        }

        try {
          await storageManager.deleteFile(record.storageKey)
          if (managedProviderKey) {
            managedKeysToDelete.add(this.normalizeKeyPath(record.storageKey))
          }
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
            if (managedProviderKey) {
              managedKeysToDelete.add(this.normalizeKeyPath(videoKey))
            }
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

    if (managedProviderKey && storageConfigForDeletion) {
      const keys = [...managedKeysToDelete].filter((key) => key.length > 0)
      if (keys.length > 0) {
        await this.managedStorageService.deleteFileReferences(managedProviderKey, keys, tenant.tenant.id)
      }
      await this.recordManagedStorageSnapshot(storageConfigForDeletion, tenant.tenant.id, 'delete')
    }

    if (records.length > 0) {
      await this.billingUsageService.recordEvent({
        eventType: BILLING_USAGE_EVENT.PHOTO_ASSET_DELETED,
        quantity: -records.length,
        metadata: {
          count: records.length,
          mode: shouldDeleteFromStorage ? 'db+storage' : 'db-only',
        },
      })
    }
    await this.emitManifestChanged(tenant.tenant.id)
  }

  async uploadAssets(
    inputs: readonly UploadAssetInput[],
    options?: UploadAssetsOptions,
  ): Promise<PhotoAssetListItem[]> {
    if (inputs.length === 0) {
      return []
    }

    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()
    const planQuota = await this.billingPlanService.getQuotaForTenant(tenant.tenant.id)
    const uploadSizeLimit = planQuota.maxUploadSizeMb
    this.enforceUploadSizeLimit(inputs, uploadSizeLimit)
    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)

    const builder = this.photoBuilderService.createBuilder(builderConfig)
    this.photoBuilderService.applyStorageConfig(builder, storageConfig)
    const transactionalStorageManager = new TransactionalStorageManager(storageConfig)
    builder.setStorageManager(transactionalStorageManager)
    await builder.ensurePluginsReady()
    const storageManager = transactionalStorageManager
    const { photoPlans, videoPlans } = this.prepareUploadPlans(inputs, storageConfig)
    const unmatchedVideoBaseNames = this.validateLivePhotoPairs(photoPlans, videoPlans)

    const emitProgress = async (event: DataSyncProgressEvent) => {
      if (!options?.progress) {
        return
      }
      await options.progress(event)
    }

    const builderLogEmitter: DataSyncProgressEmitter | undefined = options?.progress
      ? async (event) => {
          if (event.type === 'log') {
            await emitProgress(event)
          }
        }
      : undefined

    const emitLog = async (message: string, level: DataSyncLogLevel = 'info') => {
      if (!options?.progress) {
        return
      }
      await options.progress({
        type: 'log',
        payload: {
          level,
          message,
          timestamp: new Date().toISOString(),
          stage: 'missing-in-db',
        },
      })
    }

    const throwIfAborted = () => {
      if (options?.abortSignal?.aborted) {
        throw new DOMException('Upload aborted', 'AbortError')
      }
    }

    let shouldRollbackUploads = true
    try {
      await emitLog(`收到 ${inputs.length} 个上传文件，准备处理。`)
      throwIfAborted()

      const {
        items: existingItemsRaw,
        keySet: existingPhotoKeySet,
        baseNameMap: existingBaseNameMap,
      } = await this.collectExistingPhotoRecords(photoPlans, videoPlans, tenant.tenant.id, storageManager, db)
      throwIfAborted()

      const existingPhotoIds = await this.collectExistingPhotoIds(photoPlans, tenant.tenant.id, db)
      throwIfAborted()

      const groupOverrides = this.ensureUploadPlanKeyUniqueness(photoPlans, existingPhotoKeySet, existingPhotoIds)
      if (groupOverrides.size > 0) {
        this.applyGroupAdjustmentsToVideos(videoPlans, groupOverrides)
      }

      const pendingPhotoPlans = photoPlans.filter((plan) => !existingPhotoKeySet.has(plan.storageKey))
      await this.billingPlanService.ensurePhotoProcessingAllowance(tenant.tenant.id, pendingPhotoPlans.length)
      const libraryLimit = planQuota.libraryItemLimit
      await this.ensurePhotoLibraryCapacity(tenant.tenant.id, db, pendingPhotoPlans.length, libraryLimit)
      throwIfAborted()

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

      const reprocessedKeys = new Set(allPendingPhotoPlans.map((plan) => plan.storageKey))
      const existingItems = existingItemsRaw.filter((item) => !reprocessedKeys.has(item.storageKey))

      const activeVideoPlans = this.selectActiveVideoPlans(allPendingPhotoPlans, videoPlans)
      const existingStorageMap = await this.buildExistingStorageMap(
        allPendingPhotoPlans,
        activeVideoPlans,
        storageManager,
      )
      const { incomingBytes } = this.estimateManagedStorageDelta(
        storageConfig,
        allPendingPhotoPlans,
        activeVideoPlans,
        existingStorageMap,
      )
      await this.ensureManagedStorageCapacity({
        storageConfig,
        tenantId: tenant.tenant.id,
        incomingBytes,
      })
      const videoBufferMap = new Map<string, Buffer>()
      const videoObjectsByBaseName = await this.prepareVideoObjects(
        activeVideoPlans,
        storageManager,
        existingStorageMap,
        videoBufferMap,
      )

      let processedCount = 0
      const summary = this.createUploadSummary(allPendingPhotoPlans.length, existingItemsRaw.length)
      const totals = this.createUploadStageTotals(allPendingPhotoPlans.length)
      const actions: DataSyncAction[] = []

      if (options?.progress) {
        await emitProgress({
          type: 'start',
          payload: {
            summary: { ...summary },
            totals,
            options: { dryRun: false },
          },
        })
        await emitProgress({
          type: 'stage',
          payload: {
            stage: 'missing-in-db',
            status: 'start',
            processed: 0,
            total: totals['missing-in-db'],
            summary: { ...summary },
          },
        })
        await emitProgress({
          type: 'stage',
          payload: {
            stage: 'metadata-conflicts',
            status: 'start',
            processed: 0,
            total: totals['metadata-conflicts'],
            summary: { ...summary },
          },
        })
      }

      if (allPendingPhotoPlans.length === 0) {
        await emitLog('所有文件均已存在，跳过上传。', 'warn')
        if (options?.progress) {
          await emitProgress({
            type: 'stage',
            payload: {
              stage: 'missing-in-db',
              status: 'complete',
              processed: 0,
              total: totals['missing-in-db'],
              summary: { ...summary },
            },
          })
          await emitProgress({
            type: 'stage',
            payload: {
              stage: 'metadata-conflicts',
              status: 'complete',
              processed: 0,
              total: totals['metadata-conflicts'],
              summary: { ...summary },
            },
          })
          await emitProgress({
            type: 'complete',
            payload: {
              summary: { ...summary },
              actions,
            },
          })
        }
        shouldRollbackUploads = false
        await this.recordManagedStorageSnapshot(storageConfig, tenant.tenant.id)
        return existingItemsRaw
      }

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
        videoBufferMap,
        abortSignal: options?.abortSignal,
        builderLogEmitter,
        onProcessed: async ({ storageObject, manifestItem }) => {
          throwIfAborted()
          processedCount += 1
          summary.inserted += 1
          const action = this.createUploadAction(storageObject, manifestItem)
          actions.push(action)
          if (options?.progress) {
            await emitProgress({
              type: 'action',
              payload: {
                stage: 'missing-in-db',
                index: processedCount,
                total: totals['missing-in-db'],
                action,
                summary: { ...summary },
              },
            })
            await emitProgress({
              type: 'action',
              payload: {
                stage: 'metadata-conflicts',
                index: processedCount,
                total: totals['metadata-conflicts'],
                action,
                summary: { ...summary },
              },
            })
          }
          await emitLog(`已处理 ${processedCount}/${totals['missing-in-db']}：${manifestItem.title || manifestItem.id}`)
        },
      })

      const result = [...existingItems, ...processedItems]

      if (options?.progress) {
        await emitProgress({
          type: 'stage',
          payload: {
            stage: 'missing-in-db',
            status: 'complete',
            processed: processedCount,
            total: totals['missing-in-db'],
            summary: { ...summary },
          },
        })
        await emitProgress({
          type: 'stage',
          payload: {
            stage: 'metadata-conflicts',
            status: 'complete',
            processed: processedCount,
            total: totals['metadata-conflicts'],
            summary: { ...summary },
          },
        })
        await emitProgress({
          type: 'complete',
          payload: {
            summary: { ...summary },
            actions,
          },
        })
        await emitLog('所有文件处理完成。', 'success')
      }

      if (processedItems.length > 0) {
        await this.emitManifestChanged(tenant.tenant.id)
        await this.billingUsageService.recordEvent({
          eventType: BILLING_USAGE_EVENT.PHOTO_ASSET_CREATED,
          quantity: processedItems.length,
          metadata: {
            count: processedItems.length,
            uploadSource: 'manual-upload',
          },
        })
      }

      shouldRollbackUploads = false
      await this.recordManagedStorageSnapshot(storageConfig, tenant.tenant.id)
      return result
    } catch (error) {
      if (shouldRollbackUploads) {
        await storageManager.rollbackUploads().catch(() => {})
      }
      throw error
    }
  }

  private prepareUploadPlans(
    inputs: readonly UploadAssetInput[],
    storageConfig: StorageConfig,
  ): { photoPlans: PreparedUploadPlan[]; videoPlans: PreparedUploadPlan[] } {
    const photoSequenceMap = new Map<string, number>()
    const videoSequenceMap = new Map<string, number>()
    const plans: PreparedUploadPlan[] = []

    for (const input of inputs) {
      const storageKey = this.createStorageKey(input, storageConfig)
      const { basePath, extension } = this.splitStorageKey(storageKey)
      const normalizedGroupBase = this.normalizeGroupBase(basePath)
      const isVideo = this.isVideoAsset(input)
      const sequence = this.getNextSequence(isVideo ? videoSequenceMap : photoSequenceMap, normalizedGroupBase)
      const baseWithSuffix = this.appendSequenceSuffix(basePath, sequence)
      const finalKey = `${baseWithSuffix}${extension}`

      plans.push({
        original: input,
        storageKey: finalKey,
        baseName: this.normalizeBaseName(finalKey),
        groupKey: this.createPlanGroupKey(normalizedGroupBase, sequence),
        isVideo,
        isExisting: false,
      })
    }

    return {
      photoPlans: plans.filter((plan) => !plan.isVideo),
      videoPlans: plans.filter((plan) => plan.isVideo),
    }
  }

  private ensureUploadPlanKeyUniqueness(
    plans: PreparedUploadPlan[],
    existingStorageKeys: Set<string>,
    existingPhotoIds: Set<string>,
  ): Map<string, string> {
    if (plans.length === 0) {
      return new Map()
    }

    const usedStorageKeys = new Set(existingStorageKeys)
    const usedPhotoIds = new Set(existingPhotoIds)
    const overrides = new Map<string, string>()

    for (const plan of plans) {
      const uniqueKey = this.reserveUniqueStorageKeyWithPhotoId(plan.storageKey, usedStorageKeys, usedPhotoIds)
      if (uniqueKey !== plan.storageKey) {
        plan.storageKey = uniqueKey
        plan.baseName = this.normalizeBaseName(uniqueKey)
        if (plan.groupKey) {
          const { basePath } = this.splitStorageKey(uniqueKey)
          overrides.set(plan.groupKey, basePath)
        }
      }
    }

    return overrides
  }

  private applyGroupAdjustmentsToVideos(videoPlans: PreparedUploadPlan[], overrides: Map<string, string>) {
    if (videoPlans.length === 0 || overrides.size === 0) {
      return
    }

    for (const plan of videoPlans) {
      if (!plan.groupKey) {
        continue
      }
      const overrideBase = overrides.get(plan.groupKey)
      if (!overrideBase) {
        continue
      }
      const { extension } = this.splitStorageKey(plan.storageKey)
      const nextKey = `${overrideBase}${extension}`
      plan.storageKey = nextKey
      plan.baseName = this.normalizeBaseName(nextKey)
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

  private async collectExistingPhotoIds(
    photoPlans: PreparedUploadPlan[],
    tenantId: string,
    db: ReturnType<DbAccessor['get']>,
  ): Promise<Set<string>> {
    const hasPlans = photoPlans.length > 0
    if (!hasPlans) {
      return new Set()
    }

    const rows = await db
      .select({ photoId: photoAssets.photoId })
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenantId))

    return new Set(rows.map((row) => row.photoId))
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
    stagedVideoBufferMap: Map<string, Buffer>,
  ): Promise<Map<string, StorageObject>> {
    const result = new Map<string, StorageObject>()
    const transactionalManager = storageManager instanceof TransactionalStorageManager ? storageManager : null

    for (const plan of activeVideoPlans) {
      let storageObject = existingStorageMap.get(plan.storageKey)
      if (!storageObject) {
        transactionalManager?.stagePrefetchedBuffer(plan.storageKey, plan.original.buffer)
        storageObject = this.normalizeStorageObjectKey(
          await storageManager.uploadFile(plan.storageKey, plan.original.buffer, {
            contentType: plan.original.contentType,
          }),
          plan.storageKey,
        )
        if (!plan.isExisting) {
          const resolvedKey = storageObject.key ?? plan.storageKey
          stagedVideoBufferMap.set(resolvedKey, plan.original.buffer)
        }
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
    videoBufferMap: Map<string, Buffer>
    abortSignal?: AbortSignal
    builderLogEmitter?: DataSyncProgressEmitter
    onProcessed?: (payload: {
      plan: PreparedUploadPlan
      storageObject: StorageObject
      manifestItem: PhotoManifestItem
    }) => Promise<void> | void
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
      videoBufferMap,
      abortSignal,
      builderLogEmitter,
      onProcessed,
    } = params

    const results: PhotoAssetListItem[] = []
    const transactionalManager = storageManager instanceof TransactionalStorageManager ? storageManager : null

    const throwIfAborted = () => {
      if (abortSignal?.aborted) {
        throw new DOMException('Upload aborted', 'AbortError')
      }
    }

    for (const plan of pendingPhotoPlans) {
      throwIfAborted()
      let storageObject = existingStorageMap.get(plan.storageKey)
      if (!storageObject) {
        if (plan.isExisting) {
          throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
            message: `无法在存储中找到现有图片文件 ${plan.storageKey}`,
          })
        }

        transactionalManager?.stagePrefetchedBuffer(plan.storageKey, plan.original.buffer)

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
      const prefetchedBuffers = new Map<string, Buffer>()
      if (!plan.isExisting) {
        prefetchedBuffers.set(resolvedPhotoKey, plan.original.buffer)
      }
      if (videoObject?.key) {
        const videoBuffer = videoBufferMap.get(videoObject.key)
        if (videoBuffer) {
          prefetchedBuffers.set(videoObject.key, videoBuffer)
        }
      }

      const processed = await runWithBuilderLogRelay(builderLogEmitter, () =>
        this.photoBuilderService.processPhotoFromStorageObject(storageObject, {
          builder,
          builderConfig,
          processorOptions: {
            isForceMode: true,
            isForceManifest: true,
            isForceThumbnails: true,
          },
          livePhotoMap,
          prefetchedBuffers,
        }),
      )

      const item = processed?.item
      if (!item) {
        throw new BizException(ErrorCode.PHOTO_MANIFEST_GENERATION_FAILED, {
          message: `无法为文件 ${resolvedPhotoKey} 生成照片清单`,
        })
      }

      if (transactionalManager) {
        await transactionalManager.flushUploads()
        transactionalManager.clearPrefetchedBuffer(resolvedPhotoKey)
        if (videoObject) {
          transactionalManager.clearPrefetchedBuffer(videoObject.key)
        }
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

      await this.recordManagedStorageReferences(storageConfig, tenantId, [
        {
          storageKey: resolvedPhotoKey,
          size: snapshot.size ?? storageObject.size ?? plan.original.buffer?.byteLength ?? null,
          contentType: plan.original.contentType ?? null,
          etag: snapshot.etag ?? storageObject.etag ?? null,
          referenceType: 'photo.asset',
          referenceId: item.id,
        },
        ...(videoObject?.key
          ? [
              {
                storageKey: videoObject.key,
                size: videoObject.size ?? videoBufferMap.get(videoObject.key)?.byteLength ?? null,
                etag: videoObject.etag ?? null,
                referenceType: 'photo.asset.video',
                referenceId: item.id,
              },
            ]
          : []),
      ])

      if (onProcessed) {
        await onProcessed({ plan, storageObject, manifestItem: item })
      }

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
    const storageManager = await this.createStorageManager(builderConfig, storageConfig)
    return await Promise.resolve(storageManager.generatePublicUrl(storageKey))
  }

  async updateAssetTags(assetId: string, tagsInput: readonly string[]): Promise<PhotoAssetListItem> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    if (!assetId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少资源 ID' })
    }

    const record = await db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), eq(photoAssets.id, assetId)))
      .limit(1)
      .then((rows) => rows[0])

    if (!record) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '未找到指定的图片资源' })
    }

    if (!record.manifest?.data) {
      throw new BizException(ErrorCode.PHOTO_MANIFEST_GENERATION_FAILED, { message: '该资源缺少有效的清单数据' })
    }

    if (record.storageProvider === DATABASE_ONLY_PROVIDER) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '数据库占位资源不支持修改标签' })
    }

    const normalizedTags = this.normalizeTagList(tagsInput)
    const { builderConfig, storageConfig } = await this.photoStorageService.resolveConfigForTenant(tenant.tenant.id)
    const storageManager = await this.createStorageManager(builderConfig, storageConfig)

    const sanitizeKey = this.normalizeKeyPath(record.storageKey)
    const normalizeStorageKey = createStorageKeyNormalizer(storageConfig)
    const relativeKey = normalizeStorageKey(sanitizeKey)
    const fileName = path.basename(relativeKey || sanitizeKey)
    if (!fileName) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '无法解析当前图片文件名' })
    }

    const prefixSegment = this.extractStoragePrefix(sanitizeKey, relativeKey)
    const tagDirectory = normalizedTags.length > 0 ? this.joinStorageSegments(...normalizedTags) : null
    const newRelativeKey = tagDirectory ? `${tagDirectory}/${fileName}` : fileName
    const normalizedRelativeKey = this.normalizeKeyPath(newRelativeKey)
    const newStorageKey = prefixSegment
      ? this.joinStorageSegments(prefixSegment, normalizedRelativeKey)
      : normalizedRelativeKey

    const manifest = structuredClone(record.manifest)
    const photoData = manifest.data
    let storageSnapshot: ReturnType<typeof this.createStorageSnapshot> | null = null

    if (newStorageKey !== record.storageKey) {
      const moved = this.normalizeStorageObjectKey(
        await storageManager.moveFile(record.storageKey, newStorageKey, {
          contentType: inferContentTypeFromKey(newStorageKey),
        }),
        newStorageKey,
      )
      storageSnapshot = this.createStorageSnapshot(moved)
      const livePhotoUpdate = await this.relocateLivePhotoVideo(photoData, storageManager, newStorageKey)
      if (livePhotoUpdate) {
        photoData.video = {
          ...photoData.video,
          type: 'live-photo',
          videoUrl: livePhotoUpdate.videoUrl,
          s3Key: livePhotoUpdate.s3Key,
        }
      }

      if (storageSnapshot.size !== null) {
        photoData.size = storageSnapshot.size
      }
      if (storageSnapshot.lastModified) {
        photoData.lastModified = storageSnapshot.lastModified
      }
    }

    const originalUrl = await Promise.resolve(storageManager.generatePublicUrl(newStorageKey))
    photoData.tags = normalizedTags
    photoData.originalUrl = originalUrl
    photoData.s3Key = newStorageKey

    const now = new Date().toISOString()
    const updatePayload: Partial<typeof photoAssets.$inferInsert> = {
      storageKey: newStorageKey,
      manifest,
      updatedAt: now,
      syncStatus: 'synced',
    }

    if (storageSnapshot) {
      updatePayload.size = storageSnapshot.size
      updatePayload.etag = storageSnapshot.etag
      updatePayload.lastModified = storageSnapshot.lastModified
      updatePayload.metadataHash = storageSnapshot.metadataHash
      updatePayload.syncedAt = now
    }

    const [saved] = await db
      .update(photoAssets)
      .set(updatePayload)
      .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenant.tenant.id)))
      .returning()

    if (!saved) {
      throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR, { message: '更新标签失败，请稍后再试' })
    }

    const publicUrl =
      saved.storageProvider === DATABASE_ONLY_PROVIDER
        ? null
        : await Promise.resolve(storageManager.generatePublicUrl(saved.storageKey))

    await this.emitManifestChanged(tenant.tenant.id)

    return {
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
    }
  }

  private createUploadSummary(pendingCount: number, existingRecords: number): DataSyncResultSummary {
    return {
      storageObjects: pendingCount,
      databaseRecords: existingRecords,
      inserted: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      skipped: 0,
      errors: 0,
    }
  }

  private createUploadStageTotals(pendingCount: number): DataSyncStageTotals {
    return {
      'missing-in-db': pendingCount,
      'orphan-in-db': 0,
      'metadata-conflicts': pendingCount,
      'status-reconciliation': 0,
    }
  }

  private createUploadAction(storageObject: StorageObject, manifestItem: PhotoManifestItem): DataSyncAction {
    const snapshot = this.createStorageSnapshot(storageObject)
    return {
      type: 'insert',
      storageKey: storageObject.key ?? manifestItem.s3Key,
      photoId: manifestItem.id,
      applied: true,
      reason: 'Uploaded via dashboard',
      snapshots: {
        after: snapshot,
      },
      manifestAfter: structuredClone(manifestItem),
    }
  }

  private async createStorageManager(
    builderConfig: BuilderConfig,
    storageConfig: StorageConfig,
  ): Promise<StorageManager> {
    const builder = this.photoBuilderService.createBuilder(builderConfig)
    this.photoBuilderService.applyStorageConfig(builder, storageConfig)
    await builder.ensurePluginsReady()
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

  private enforceUploadSizeLimit(inputs: readonly UploadAssetInput[], limitMb: number | null): void {
    const maxBytes = this.convertMbToBytes(limitMb)
    if (maxBytes === null || inputs.length === 0) {
      return
    }

    for (const input of inputs) {
      const size = input.buffer?.length ?? 0
      if (size <= maxBytes) {
        continue
      }

      const displayLimit = limitMb ?? this.formatBytesToMb(maxBytes)
      const actualSize = this.formatBytesToMb(size)
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `文件 ${input.filename} (${actualSize} MB) 超出允许的单张大小 ${displayLimit} MB`,
      })
    }
  }

  private convertMbToBytes(value: number | null): number | null {
    if (value === null) {
      return null
    }
    return value * 1024 * 1024
  }

  private formatBytesToMb(value: number): number {
    const mb = value / (1024 * 1024)
    return Number(mb.toFixed(2))
  }

  private async ensurePhotoLibraryCapacity(
    tenantId: string,
    db: ReturnType<DbAccessor['get']>,
    newPhotos: number,
    limit: number | null,
  ): Promise<void> {
    if (limit === null || newPhotos === 0) {
      return
    }

    const current = await this.countTenantPhotos(tenantId, db)
    if (current + newPhotos > limit) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `当前图库已有 ${current} 张图片，超过上限 ${limit}，无法继续上传`,
      })
    }
  }

  private async countTenantPhotos(tenantId: string, db: ReturnType<DbAccessor['get']>): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenantId))
    return typeof row?.total === 'number' ? row.total : Number(row?.total ?? 0)
  }

  private splitStorageKey(storageKey: string): { basePath: string; extension: string } {
    const extension = path.extname(storageKey)
    if (!extension) {
      return { basePath: storageKey, extension: '' }
    }
    return {
      basePath: storageKey.slice(0, -extension.length),
      extension,
    }
  }

  private normalizeGroupBase(basePath: string): string {
    return this.normalizeKeyPath(basePath).toLowerCase()
  }

  private createPlanGroupKey(basePath: string, sequence: number): string {
    return `${basePath}#${sequence}`
  }

  private getNextSequence(sequenceMap: Map<string, number>, basePath: string): number {
    const next = (sequenceMap.get(basePath) ?? 0) + 1
    sequenceMap.set(basePath, next)
    return next
  }

  private appendSequenceSuffix(basePath: string, sequence: number): string {
    if (sequence <= 1) {
      return basePath
    }
    return `${basePath}-${sequence}`
  }

  private reserveUniqueStorageKeyWithPhotoId(
    initialKey: string,
    usedStorageKeys: Set<string>,
    usedPhotoIds: Set<string>,
  ): string {
    let candidateKey = initialKey

    while (true) {
      const candidatePhotoId = this.extractPhotoIdFromKey(candidateKey)
      if (!usedStorageKeys.has(candidateKey) && !usedPhotoIds.has(candidatePhotoId)) {
        usedStorageKeys.add(candidateKey)
        usedPhotoIds.add(candidatePhotoId)
        return candidateKey
      }

      candidateKey = this.incrementStorageKeyBase(candidateKey)
    }
  }

  private incrementStorageKeyBase(storageKey: string): string {
    const { basePath, extension } = this.splitStorageKey(storageKey)
    const { root, suffix } = this.splitBaseAndNumericSuffix(basePath)
    const nextIndex = (suffix ?? 1) + 1
    return `${root}-${nextIndex}${extension}`
  }

  private splitBaseAndNumericSuffix(basePath: string): { root: string; suffix: number | null } {
    const match = basePath.match(/^(.*?)(?:-(\d+))?$/)
    if (!match) {
      return { root: basePath, suffix: null }
    }

    const root = match[1] || basePath
    const parsed = typeof match[2] === 'string' ? Number.parseInt(match[2], 10) : null
    const suffix = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
    return { root, suffix }
  }

  private extractPhotoIdFromKey(storageKey: string): string {
    const { basePath } = this.splitStorageKey(storageKey)
    return path.basename(basePath)
  }

  private createStorageKey(input: UploadAssetInput, storageConfig: StorageConfig): string {
    const ext = path.extname(input.filename)
    const base = path.basename(input.filename, ext).trim()

    const timestamp = Date.now().toString()
    const storageDirectory = this.resolveStorageDirectory(storageConfig)
    const customDirectory = this.normalizeDirectory(input.directory)
    const combinedDirectory = this.joinStorageSegments(storageDirectory, customDirectory)
    const keySegment = base || timestamp
    const normalized = combinedDirectory ? `${combinedDirectory}/${keySegment}${ext}` : `${keySegment}${ext}`
    return this.normalizeKeyPath(normalized)
  }

  private resolveStorageDirectory(storageConfig: StorageConfig): string | null {
    switch (storageConfig.provider) {
      case 's3': {
        return this.normalizeDirectory((storageConfig as unknown as S3Config).prefix)
      }
      case 'github': {
        return this.normalizeDirectory((storageConfig as GitHubConfig).path)
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
      const base = this.normalizeStorageSegment((storageConfig as S3Config).prefix)
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

    const normalized = trimmed.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
    return normalized.length > 0 ? normalized : null
  }

  private joinStorageSegments(...segments: Array<string | null | undefined>): string {
    const filtered: string[] = []
    for (const segment of segments) {
      if (!segment) {
        continue
      }
      filtered.push(segment.replaceAll(/^\/+|\/+$/g, ''))
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

  private normalizeTagList(input: readonly string[] | undefined): string[] {
    if (!Array.isArray(input) || input.length === 0) {
      return []
    }

    const seen = new Set<string>()
    const normalized: string[] = []

    for (const raw of input) {
      if (typeof raw !== 'string') {
        continue
      }
      const sanitized = raw
        .replaceAll(/[\\/]+/g, '-')
        .replaceAll(/\s+/g, ' ')
        .trim()
      if (!sanitized || sanitized === '.' || sanitized === '..') {
        continue
      }
      const truncated = sanitized.slice(0, 64)
      const key = truncated.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      normalized.push(truncated)
      if (normalized.length >= 32) {
        break
      }
    }

    return normalized
  }

  private extractStoragePrefix(fullKey: string, relativeKey: string): string | null {
    if (!fullKey || fullKey === relativeKey) {
      return null
    }

    const diffLength = fullKey.length - relativeKey.length
    if (diffLength <= 0) {
      return null
    }

    const prefix = fullKey.slice(0, diffLength).replace(/\/+$/, '')
    return prefix.length > 0 ? prefix : null
  }

  private resolveManagedProviderKey(storageConfig: StorageConfig): string | null {
    if (storageConfig.provider !== 'managed') {
      return null
    }
    const managedConfig = storageConfig as ManagedStorageConfig
    const providerKey = managedConfig.providerKey ?? managedConfig.upstream.provider
    if (typeof providerKey !== 'string') {
      return null
    }
    const normalized = providerKey.trim()
    return normalized.length > 0 ? normalized : null
  }

  private estimateManagedStorageDelta(
    storageConfig: StorageConfig,
    pendingPhotoPlans: PreparedUploadPlan[],
    activeVideoPlans: PreparedUploadPlan[],
    existingStorageMap: Map<string, StorageObject>,
  ): { providerKey: string | null; incomingBytes: number; incomingFiles: number } {
    const providerKey = this.resolveManagedProviderKey(storageConfig)
    if (!providerKey) {
      return { providerKey: null, incomingBytes: 0, incomingFiles: 0 }
    }

    let incomingBytes = 0
    let incomingFiles = 0
    const seenKeys = new Set<string>()

    const appendPlan = (plan: PreparedUploadPlan) => {
      const normalizedKey = this.normalizeKeyPath(plan.storageKey)
      if (!normalizedKey || plan.isExisting || existingStorageMap.has(normalizedKey) || seenKeys.has(normalizedKey)) {
        return
      }
      seenKeys.add(normalizedKey)
      incomingFiles += 1
      incomingBytes += plan.original.buffer?.byteLength ?? 0
    }

    pendingPhotoPlans.forEach(appendPlan)
    activeVideoPlans.forEach(appendPlan)

    return { providerKey, incomingBytes, incomingFiles }
  }

  private async ensureManagedStorageCapacity(params: {
    storageConfig: StorageConfig
    tenantId: string
    incomingBytes: number
  }): Promise<void> {
    const providerKey = this.resolveManagedProviderKey(params.storageConfig)
    if (!providerKey) {
      return
    }

    const quota = await this.storagePlanService.getQuotaForTenant(params.tenantId)
    const capacity = quota.totalBytes
    if (capacity === null) {
      return
    }

    const usage = await this.managedStorageService.getUsageTotals(providerKey, params.tenantId)
    const projectedBytes = usage.totalBytes + Math.max(0, params.incomingBytes)

    if (usage.totalBytes > capacity) {
      await this.managedStorageService.recordUsageSnapshot({
        tenantId: params.tenantId,
        providerKey,
        operation: 'over-limit',
        totalBytes: usage.totalBytes,
        fileCount: usage.fileCount,
      })
      throw new BizException(ErrorCode.BILLING_QUOTA_EXCEEDED, {
        message: `托管存储空间已超出套餐上限：当前已用 ${this.formatBytesForDisplay(
          usage.totalBytes,
        )}，套餐上限 ${this.formatBytesForDisplay(capacity)}。请清理空间或升级存储方案后再试。`,
      })
    }

    if (projectedBytes > capacity) {
      await this.managedStorageService.recordUsageSnapshot({
        tenantId: params.tenantId,
        providerKey,
        operation: 'over-limit',
        totalBytes: usage.totalBytes,
        fileCount: usage.fileCount,
      })
      throw new BizException(ErrorCode.BILLING_QUOTA_EXCEEDED, {
        message: `托管存储空间不足：当前已用 ${this.formatBytesForDisplay(
          usage.totalBytes,
        )}，上传后预计 ${this.formatBytesForDisplay(projectedBytes)}，已超过套餐上限 ${this.formatBytesForDisplay(
          capacity,
        )}。请清理空间或升级存储方案后再试。`,
      })
    }
  }

  private formatBytesForDisplay(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }

    const fixed = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
    return `${fixed} ${units[unitIndex]}`
  }

  private async recordManagedStorageReferences(
    storageConfig: StorageConfig,
    tenantId: string,
    references: Array<{
      storageKey: string
      size?: number | null
      contentType?: string | null
      etag?: string | null
      referenceType?: string | null
      referenceId?: string | null
    }>,
  ): Promise<void> {
    if (storageConfig.provider !== 'managed') {
      return
    }

    const managedConfig = storageConfig as ManagedStorageConfig
    const providerKey = managedConfig.providerKey ?? managedConfig.upstream.provider
    if (!providerKey || references.length === 0) {
      return
    }

    const tasks = references
      .map((reference) => ({
        ...reference,
        storageKey: this.normalizeKeyPath(reference.storageKey),
      }))
      .filter((reference) => reference.storageKey.length > 0)
      .map((reference) =>
        this.managedStorageService.upsertFileReference({
          tenantId,
          providerKey,
          storageProvider: managedConfig.upstream.provider,
          storageKey: reference.storageKey,
          size: reference.size ?? null,
          contentType: reference.contentType ?? null,
          etag: reference.etag ?? null,
          referenceType: reference.referenceType ?? null,
          referenceId: reference.referenceId ?? null,
        }),
      )

    if (tasks.length === 0) {
      return
    }

    await Promise.all(tasks)
  }

  private async recordManagedStorageSnapshot(
    storageConfig: StorageConfig,
    tenantId: string,
    operation?: string | null,
  ): Promise<void> {
    const providerKey = this.resolveManagedProviderKey(storageConfig)
    if (!providerKey) {
      return
    }
    const usage = await this.managedStorageService.getUsageTotals(providerKey, tenantId)
    await this.managedStorageService.recordUsageSnapshot({
      tenantId,
      providerKey,
      operation: operation ?? 'snapshot',
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
    })
  }

  private async relocateLivePhotoVideo(
    manifest: PhotoManifestItem,
    storageManager: StorageManager,
    newPhotoKey: string,
  ): Promise<{ s3Key: string; videoUrl: string } | null> {
    const { video } = manifest
    if (!video || video.type !== 'live-photo' || !video.s3Key) {
      return null
    }

    const normalizedVideoKey = this.normalizeKeyPath(video.s3Key)
    const { basePath: newPhotoBase } = this.splitStorageKey(newPhotoKey)
    if (!newPhotoBase) {
      return null
    }

    const extension = path.extname(normalizedVideoKey) || '.mov'
    const nextVideoKey = `${newPhotoBase}${extension}`

    if (nextVideoKey === normalizedVideoKey) {
      const videoUrl = await Promise.resolve(storageManager.generatePublicUrl(nextVideoKey))
      return { s3Key: nextVideoKey, videoUrl }
    }

    const moved = this.normalizeStorageObjectKey(
      await storageManager.moveFile(normalizedVideoKey, nextVideoKey, {
        contentType: inferContentTypeFromKey(nextVideoKey),
      }),
      nextVideoKey,
    )
    const videoUrl = await Promise.resolve(storageManager.generatePublicUrl(moved.key ?? nextVideoKey))
    return {
      s3Key: moved.key ?? nextVideoKey,
      videoUrl,
    }
  }
}
