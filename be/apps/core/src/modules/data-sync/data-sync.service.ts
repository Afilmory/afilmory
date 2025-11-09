import type { BuilderConfig, PhotoManifestItem, StorageConfig, StorageManager, StorageObject } from '@afilmory/builder'
import type { PhotoAssetConflictPayload, PhotoAssetConflictSnapshot, PhotoAssetManifest } from '@afilmory/db'
import { CURRENT_PHOTO_MANIFEST_VERSION, DATABASE_ONLY_PROVIDER, photoAssets } from '@afilmory/db'
import { createLogger, EventEmitterService } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { PhotoBuilderService } from 'core/modules/photo/photo.service'
import { PhotoStorageService } from 'core/modules/photo/photo-storage.service'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { DbAccessor } from '../../database/database.provider'
import { requireTenantContext } from '../tenant/tenant.context'
import type {
  ConflictPayload,
  DataSyncAction,
  DataSyncConflict,
  DataSyncOptions,
  DataSyncProgressEmitter,
  DataSyncProgressStage,
  DataSyncResult,
  DataSyncResultSummary,
  DataSyncStageTotals,
  ResolveConflictOptions,
  SyncObjectSnapshot,
} from './data-sync.types'
import { ConflictResolutionStrategy } from './data-sync.types'

const UNIQUE_VIOLATION_CODE = '23505'
const UNIQUE_CONSTRAINT_PHOTO_ID = 'uq_photo_asset_tenant_photo_id'
const UNIQUE_CONSTRAINT_STORAGE_KEY = 'uq_photo_asset_tenant_storage_key'

type PhotoAssetRecord = typeof photoAssets.$inferSelect
type PhotoAssetInsert = typeof photoAssets.$inferInsert

type ConflictCandidate = {
  record: PhotoAssetRecord
  storageObject: StorageObject
  storageSnapshot: SyncObjectSnapshot
  recordSnapshot: SyncObjectSnapshot
}

type StatusReconciliationEntry = {
  record: PhotoAssetRecord
  storageSnapshot: SyncObjectSnapshot
}

interface SyncPreparation {
  tenantId: string
  builder: ReturnType<PhotoBuilderService['createBuilder']>
  storageManager: StorageManager
  effectiveStorageConfig: StorageConfig
  storageObjects: StorageObject[]
  records: PhotoAssetRecord[]
  storageByKey: Map<string, StorageObject>
  recordByKey: Map<string, PhotoAssetRecord>
  missingInDb: StorageObject[]
  orphanInDb: PhotoAssetRecord[]
  conflictCandidates: ConflictCandidate[]
  statusReconciliation: StatusReconciliationEntry[]
  db: ReturnType<DbAccessor['get']>
  livePhotoMap?: Map<string, StorageObject>
}

@injectable()
export class DataSyncService {
  private readonly logger = createLogger('DataSyncService')
  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly dbAccessor: DbAccessor,
    private readonly photoBuilderService: PhotoBuilderService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  private async emitManifestChanged(tenantId: string): Promise<void> {
    await this.eventEmitter.emit('photo.manifest.changed', { tenantId })
  }

  async runSync(options: DataSyncOptions, onProgress?: DataSyncProgressEmitter): Promise<DataSyncResult> {
    const tenant = requireTenantContext()
    const { builderConfig, storageConfig } = await this.resolveBuilderConfigForTenant(tenant.tenant.id, options)
    const context = await this.prepareSyncContext(tenant.tenant.id, builderConfig, storageConfig)
    const summary = this.createSummary(context)
    const actions: DataSyncAction[] = []
    const totals = this.buildStageTotals(context)

    await this.emitStart(onProgress, summary, totals, options)

    await this.emitStageProgress(onProgress, {
      stage: 'missing-in-db',
      status: 'start',
      total: totals['missing-in-db'],
      processed: 0,
      summary,
    })
    const missingProcessed = await this.handleNewStorageObjects(context, summary, actions, options.dryRun, onProgress)
    await this.emitStageProgress(onProgress, {
      stage: 'missing-in-db',
      status: 'complete',
      total: totals['missing-in-db'],
      processed: missingProcessed,
      summary,
    })

    await this.emitStageProgress(onProgress, {
      stage: 'orphan-in-db',
      status: 'start',
      total: totals['orphan-in-db'],
      processed: 0,
      summary,
    })
    const orphanProcessed = await this.handleOrphanRecords(context, summary, actions, options.dryRun, onProgress)
    await this.emitStageProgress(onProgress, {
      stage: 'orphan-in-db',
      status: 'complete',
      total: totals['orphan-in-db'],
      processed: orphanProcessed,
      summary,
    })

    await this.emitStageProgress(onProgress, {
      stage: 'metadata-conflicts',
      status: 'start',
      total: totals['metadata-conflicts'],
      processed: 0,
      summary,
    })
    const conflictProcessed = await this.handleMetadataConflicts(context, summary, actions, options.dryRun, onProgress)
    await this.emitStageProgress(onProgress, {
      stage: 'metadata-conflicts',
      status: 'complete',
      total: totals['metadata-conflicts'],
      processed: conflictProcessed,
      summary,
    })

    await this.emitStageProgress(onProgress, {
      stage: 'status-reconciliation',
      status: 'start',
      total: totals['status-reconciliation'],
      processed: 0,
      summary,
    })
    const reconciliationProcessed = await this.handleStatusReconciliation(
      context,
      summary,
      actions,
      options.dryRun,
      onProgress,
    )
    await this.emitStageProgress(onProgress, {
      stage: 'status-reconciliation',
      status: 'complete',
      total: totals['status-reconciliation'],
      processed: reconciliationProcessed,
      summary,
    })

    const result: DataSyncResult = {
      summary,
      actions,
    }

    await this.emitComplete(onProgress, result)

    if (!options.dryRun) {
      const mutated = actions.some((action) => action.applied)
      if (mutated) {
        await this.emitManifestChanged(tenant.tenant.id)
      }
    }

    return result
  }

  async listConflicts(): Promise<DataSyncConflict[]> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const records = await db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenant.tenant.id), eq(photoAssets.syncStatus, 'conflict')))

    return records.map((record) => this.mapRecordToConflict(record))
  }

  async resolveConflict(id: string, options: ResolveConflictOptions): Promise<DataSyncAction> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const [record] = await db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.id, id), eq(photoAssets.tenantId, tenant.tenant.id)))
      .limit(1)

    if (!record) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: 'Conflict record not found.' })
    }

    if (record.syncStatus !== 'conflict') {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Target record is not in conflict state.' })
    }

    const { conflictPayload } = record
    if (!conflictPayload) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Missing conflict payload on record.' })
    }

    const dryRun = options.dryRun ?? false

    if (options.strategy === ConflictResolutionStrategy.PREFER_STORAGE) {
      const action = await this.resolveByStorage(record, conflictPayload, options, dryRun, tenant.tenant.id, db)
      if (!dryRun && action.applied) {
        await this.emitManifestChanged(tenant.tenant.id)
      }
      return action
    }

    const action = await this.resolveByDatabase(record, conflictPayload, dryRun, tenant.tenant.id, db)
    if (!dryRun && action.applied) {
      await this.emitManifestChanged(tenant.tenant.id)
    }
    return action
  }

  private async prepareSyncContext(
    tenantId: string,
    builderConfig: BuilderConfig,
    storageConfig?: StorageConfig,
  ): Promise<SyncPreparation> {
    const builder = this.photoBuilderService.createBuilder(builderConfig)
    const effectiveStorageConfig = storageConfig ?? builderConfig.storage

    this.logger.verbose('effectiveStorageConfig', effectiveStorageConfig)
    this.registerStorageProviderPlugin(builder, effectiveStorageConfig)
    if (storageConfig) {
      this.photoBuilderService.applyStorageConfig(builder, storageConfig)
    }

    const storageManager = builder.getStorageManager()
    const storageObjects = await storageManager.listImages()
    const db = this.dbAccessor.get()
    const records = await db.select().from(photoAssets).where(eq(photoAssets.tenantId, tenantId))

    const storageByKey = new Map(storageObjects.map((object) => [object.key, object]))
    const recordByKey = new Map(records.map((record) => [record.storageKey, record]))

    const missingInDb = storageObjects.filter((object) => !recordByKey.has(object.key))
    const orphanInDb = records.filter(
      (record) => record.storageProvider !== DATABASE_ONLY_PROVIDER && !storageByKey.has(record.storageKey),
    )

    const conflictCandidates: ConflictCandidate[] = []
    const statusReconciliation: StatusReconciliationEntry[] = []

    for (const [storageKey, record] of recordByKey) {
      const storageObject = storageByKey.get(storageKey)
      if (!storageObject) {
        continue
      }

      const storageSnapshot = this.createStorageSnapshot(storageObject)
      const recordSnapshot = this.createRecordSnapshot(record)

      if (storageSnapshot.metadataHash !== recordSnapshot.metadataHash) {
        conflictCandidates.push({ record, storageObject, storageSnapshot, recordSnapshot })
        continue
      }

      if (record.syncStatus !== 'synced') {
        statusReconciliation.push({ record, storageSnapshot })
      }
    }

    return {
      tenantId,
      builder,
      storageManager,
      effectiveStorageConfig,
      storageObjects,
      records,
      storageByKey,
      recordByKey,
      missingInDb,
      orphanInDb,
      conflictCandidates,
      statusReconciliation,
      db,
    }
  }

  private registerStorageProviderPlugin(
    builder: ReturnType<PhotoBuilderService['createBuilder']>,
    storageConfig: StorageConfig,
  ): void {
    this.photoStorageService.registerStorageProviderPlugin(builder, storageConfig)
  }

  private async resolveBuilderConfigForTenant(
    tenantId: string,
    overrides: Pick<DataSyncOptions, 'builderConfig' | 'storageConfig'>,
  ): Promise<{ builderConfig: BuilderConfig; storageConfig: StorageConfig }> {
    return await this.photoStorageService.resolveConfigForTenant(tenantId, overrides)
  }

  private createSummary(context: SyncPreparation): DataSyncResult['summary'] {
    return {
      storageObjects: context.storageObjects.length,
      databaseRecords: context.records.length,
      inserted: 0,
      updated: 0,
      deleted: 0,
      conflicts: 0,
      skipped: 0,
    }
  }

  private async handleNewStorageObjects(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    dryRun: boolean,
    onProgress?: DataSyncProgressEmitter,
  ): Promise<number> {
    const total = context.missingInDb.length
    if (total === 0) {
      return 0
    }

    const livePhotoMap = await this.ensureLivePhotoMap(context, dryRun)
    const { db, tenantId, effectiveStorageConfig, builder } = context
    let processed = 0

    for (const storageObject of context.missingInDb) {
      processed += 1
      const storageSnapshot = this.createStorageSnapshot(storageObject)

      if (dryRun) {
        summary.inserted += 1
        const action: DataSyncAction = {
          type: 'insert',
          storageKey: storageObject.key,
          photoId: null,
          applied: false,
          reason: 'Preview - new storage object would be imported.',
          snapshots: {
            after: storageSnapshot,
          },
          manifestAfter: null,
        }
        actions.push(action)
        await this.emitActionProgress(onProgress, {
          stage: 'missing-in-db',
          index: processed,
          total,
          action,
          summary,
        })
        continue
      }

      const result = await this.safeProcessStorageObject(storageObject, builder, {
        livePhotoMap,
      })

      if (!result?.item) {
        summary.conflicts += 1
        const action: DataSyncAction = {
          type: 'conflict',
          storageKey: storageObject.key,
          photoId: null,
          applied: false,
          reason: 'Failed to generate manifest for new storage object.',
          snapshots: {
            after: storageSnapshot,
          },
          manifestAfter: null,
        }
        actions.push(action)
        await this.emitActionProgress(onProgress, {
          stage: 'missing-in-db',
          index: processed,
          total,
          action,
          summary,
        })
        continue
      }

      const manifestPayload = this.createManifestPayload(result.item)
      const { metadataHash } = storageSnapshot
      const now = this.nowIso()
      try {
        await db
          .insert(photoAssets)
          .values(
            this.buildInsertPayload({
              tenantId,
              storageObject,
              manifest: manifestPayload,
              metadataHash,
              storageProvider: effectiveStorageConfig.provider,
              photoId: result.item.id,
              syncedAt: now,
            }),
          )
          .onConflictDoUpdate({
            target: [photoAssets.tenantId, photoAssets.storageKey],
            set: {
              photoId: result.item.id,
              storageProvider: effectiveStorageConfig.provider,
              size: storageSnapshot.size,
              etag: storageSnapshot.etag,
              lastModified: storageSnapshot.lastModified,
              metadataHash,
              manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
              manifest: manifestPayload,
              syncStatus: 'synced',
              conflictReason: null,
              conflictPayload: null,
              syncedAt: now,
              updatedAt: now,
            },
          })

        summary.inserted += 1
        const action: DataSyncAction = {
          type: 'insert',
          storageKey: storageObject.key,
          photoId: result.item.id,
          applied: true,
          snapshots: {
            after: storageSnapshot,
          },
          manifestAfter: result.item,
        }
        actions.push(action)
        await this.emitActionProgress(onProgress, {
          stage: 'missing-in-db',
          index: processed,
          total,
          action,
          summary,
        })
      } catch (error) {
        const constraintError = this.extractConstraintViolation(error)
        if (constraintError && this.isUniqueConstraintViolation(constraintError)) {
          if (this.isPhotoIdConstraintViolation(constraintError)) {
            await this.handlePhotoIdConflictDuringInsert(context, summary, actions, {
              storageObject,
              storageSnapshot,
              manifestItem: result.item,
              index: processed,
              total,
              onProgress,
            })
            continue
          }

          if (this.isStorageKeyConstraintViolation(constraintError)) {
            await this.handleStorageKeyConflictDuringInsert(context, summary, actions, {
              storageObject,
              storageSnapshot,
              manifestItem: result.item,
              index: processed,
              total,
              onProgress,
            })
            continue
          }
        }

        throw error
      }
    }

    return processed
  }

  private async handlePhotoIdConflictDuringInsert(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    payload: {
      storageObject: StorageObject
      storageSnapshot: SyncObjectSnapshot
      manifestItem: PhotoManifestItem
      index: number
      total: number
      onProgress?: DataSyncProgressEmitter
    },
  ): Promise<void> {
    const { db, tenantId } = context

    const [existingRecord] = await db
      .select()
      .from(photoAssets)
      .where(and(eq(photoAssets.tenantId, tenantId), eq(photoAssets.photoId, payload.manifestItem.id)))
      .limit(1)

    if (!existingRecord) {
      this.logger.error('Detected photoId unique constraint violation but no existing record found. Skipping import.', {
        tenantId,
        photoId: payload.manifestItem.id,
        storageKey: payload.storageObject.key,
      })

      summary.skipped += 1
      const action: DataSyncAction = {
        type: 'conflict',
        storageKey: payload.storageObject.key,
        photoId: payload.manifestItem.id,
        applied: false,
        reason: 'Photo ID conflict detected but existing record could not be loaded.',
        conflictId: null,
        conflictPayload: null,
        snapshots: {
          after: payload.storageSnapshot,
        },
        manifestAfter: payload.manifestItem,
      }
      actions.push(action)
      await this.emitActionProgress(payload.onProgress, {
        stage: 'missing-in-db',
        index: payload.index,
        total: payload.total,
        action,
        summary,
      })
      return
    }

    summary.conflicts += 1
    const now = this.nowIso()
    const conflictPayload = this.createConflictPayload('photo-id-conflict', {
      storageSnapshot: payload.storageSnapshot,
      recordSnapshot: this.createRecordSnapshot(existingRecord),
      incomingStorageKey: payload.storageObject.key,
    })
    const conflictPayloadResponse = this.mapConflictPayloadToResponse(conflictPayload)

    await db
      .update(photoAssets)
      .set({
        syncStatus: 'conflict',
        conflictReason: 'Photo ID already exists for this tenant.',
        conflictPayload,
        syncedAt: now,
        updatedAt: now,
      })
      .where(and(eq(photoAssets.id, existingRecord.id), eq(photoAssets.tenantId, tenantId)))

    const action: DataSyncAction = {
      type: 'conflict',
      storageKey: payload.storageObject.key,
      photoId: payload.manifestItem.id,
      applied: true,
      reason: 'Photo ID already exists for this tenant.',
      conflictId: existingRecord.id,
      conflictPayload: conflictPayloadResponse,
      snapshots: {
        before: this.createRecordSnapshot(existingRecord),
        after: payload.storageSnapshot,
      },
      manifestBefore: existingRecord.manifest.data,
      manifestAfter: payload.manifestItem,
    }
    actions.push(action)
    await this.emitActionProgress(payload.onProgress, {
      stage: 'missing-in-db',
      index: payload.index,
      total: payload.total,
      action,
      summary,
    })
  }

  private async handleStorageKeyConflictDuringInsert(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    payload: {
      storageObject: StorageObject
      storageSnapshot: SyncObjectSnapshot
      manifestItem: PhotoManifestItem
      index: number
      total: number
      onProgress?: DataSyncProgressEmitter
    },
  ): Promise<void> {
    const { db, tenantId, recordByKey } = context

    const existingRecord = recordByKey.get(payload.storageObject.key)

    if (!existingRecord) {
      this.logger.error('Detected storage key unique constraint violation but no record found. Marking as skipped.', {
        tenantId,
        storageKey: payload.storageObject.key,
      })

      summary.skipped += 1
      const action: DataSyncAction = {
        type: 'conflict',
        storageKey: payload.storageObject.key,
        photoId: payload.manifestItem.id,
        applied: false,
        reason: 'Storage key conflict detected but existing record could not be loaded.',
        conflictId: null,
        conflictPayload: null,
        snapshots: {
          after: payload.storageSnapshot,
        },
        manifestAfter: payload.manifestItem,
      }
      actions.push(action)
      await this.emitActionProgress(payload.onProgress, {
        stage: 'missing-in-db',
        index: payload.index,
        total: payload.total,
        action,
        summary,
      })
      return
    }

    summary.conflicts += 1
    const now = this.nowIso()
    const conflictPayload = this.createConflictPayload('metadata-mismatch', {
      storageSnapshot: payload.storageSnapshot,
      recordSnapshot: this.createRecordSnapshot(existingRecord),
    })
    const conflictPayloadResponse = this.mapConflictPayloadToResponse(conflictPayload)

    await db
      .update(photoAssets)
      .set({
        syncStatus: 'conflict',
        conflictReason: 'Storage key already exists for this tenant.',
        conflictPayload,
        syncedAt: now,
        updatedAt: now,
      })
      .where(and(eq(photoAssets.id, existingRecord.id), eq(photoAssets.tenantId, tenantId)))

    const action: DataSyncAction = {
      type: 'conflict',
      storageKey: payload.storageObject.key,
      photoId: payload.manifestItem.id,
      applied: true,
      reason: 'Storage key already exists for this tenant.',
      conflictId: existingRecord.id,
      conflictPayload: conflictPayloadResponse,
      snapshots: {
        before: this.createRecordSnapshot(existingRecord),
        after: payload.storageSnapshot,
      },
      manifestBefore: existingRecord.manifest.data,
      manifestAfter: payload.manifestItem,
    }
    actions.push(action)
    await this.emitActionProgress(payload.onProgress, {
      stage: 'missing-in-db',
      index: payload.index,
      total: payload.total,
      action,
      summary,
    })
  }

  private async handleOrphanRecords(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    dryRun: boolean,
    onProgress?: DataSyncProgressEmitter,
  ): Promise<number> {
    const total = context.orphanInDb.length
    if (total === 0) {
      return 0
    }

    const { db, tenantId } = context
    let processed = 0

    for (const record of context.orphanInDb) {
      processed += 1
      const recordSnapshot = this.createRecordSnapshot(record)
      summary.conflicts += 1

      const conflictPayload = this.createConflictPayload('missing-in-storage', {
        recordSnapshot,
      })
      const conflictPayloadResponse = this.mapConflictPayloadToResponse(conflictPayload)

      if (!dryRun) {
        const now = this.nowIso()
        await db
          .update(photoAssets)
          .set({
            syncStatus: 'conflict',
            conflictReason: 'Storage object missing in provider.',
            conflictPayload,
            syncedAt: now,
            updatedAt: now,
          })
          .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
      }

      const action: DataSyncAction = {
        type: 'conflict',
        storageKey: record.storageKey,
        photoId: record.photoId,
        applied: !dryRun,
        reason: 'Storage object missing in provider.',
        conflictId: record.id,
        conflictPayload: conflictPayloadResponse,
        snapshots: {
          before: recordSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: null,
      }
      actions.push(action)
      await this.emitActionProgress(onProgress, {
        stage: 'orphan-in-db',
        index: processed,
        total,
        action,
        summary,
      })
    }

    return processed
  }

  private async handleMetadataConflicts(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    dryRun: boolean,
    onProgress?: DataSyncProgressEmitter,
  ): Promise<number> {
    const total = context.conflictCandidates.length
    if (total === 0) {
      return 0
    }

    const { db, tenantId } = context
    let processed = 0

    for (const candidate of context.conflictCandidates) {
      processed += 1
      const { record, storageObject, storageSnapshot, recordSnapshot } = candidate
      summary.conflicts += 1

      const conflictPayload = this.createConflictPayload('metadata-mismatch', {
        storageSnapshot,
        recordSnapshot,
      })
      const conflictPayloadResponse = this.mapConflictPayloadToResponse(conflictPayload)

      if (!dryRun) {
        const now = this.nowIso()
        await db
          .update(photoAssets)
          .set({
            syncStatus: 'conflict',
            conflictReason: 'Storage metadata differs from database manifest.',
            conflictPayload,
            syncedAt: now,
            updatedAt: now,
          })
          .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
      }

      const action: DataSyncAction = {
        type: 'conflict',
        storageKey: storageObject.key,
        photoId: record.photoId,
        applied: !dryRun,
        reason: 'Storage metadata differs from database manifest.',
        conflictId: record.id,
        conflictPayload: conflictPayloadResponse,
        snapshots: {
          before: recordSnapshot,
          after: storageSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: null,
      }
      actions.push(action)
      await this.emitActionProgress(onProgress, {
        stage: 'metadata-conflicts',
        index: processed,
        total,
        action,
        summary,
      })
    }

    return processed
  }

  private async handleStatusReconciliation(
    context: SyncPreparation,
    summary: DataSyncResult['summary'],
    actions: DataSyncAction[],
    dryRun: boolean,
    onProgress?: DataSyncProgressEmitter,
  ): Promise<number> {
    const total = context.statusReconciliation.length
    if (total === 0) {
      return 0
    }

    const { db, tenantId } = context
    let processed = 0

    for (const entry of context.statusReconciliation) {
      processed += 1
      const { record, storageSnapshot } = entry
      summary.updated += 1

      if (!dryRun) {
        const now = this.nowIso()
        await db
          .update(photoAssets)
          .set({
            size: storageSnapshot.size,
            etag: storageSnapshot.etag,
            lastModified: storageSnapshot.lastModified,
            metadataHash: storageSnapshot.metadataHash,
            syncStatus: 'synced',
            conflictReason: null,
            conflictPayload: null,
            syncedAt: now,
            updatedAt: now,
          })
          .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
      }

      const action: DataSyncAction = {
        type: 'update',
        storageKey: record.storageKey,
        photoId: record.photoId,
        applied: !dryRun,
        reason: 'Marked as synced to reflect matching metadata.',
        snapshots: {
          before: this.createRecordSnapshot(record),
          after: storageSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: record.manifest.data,
      }
      actions.push(action)
      await this.emitActionProgress(onProgress, {
        stage: 'status-reconciliation',
        index: processed,
        total,
        action,
        summary,
      })
    }

    return processed
  }

  private async emitStart(
    emitter: DataSyncProgressEmitter | undefined,
    summary: DataSyncResult['summary'],
    totals: DataSyncStageTotals,
    options: DataSyncOptions,
  ): Promise<void> {
    if (!emitter) {
      return
    }

    await emitter({
      type: 'start',
      payload: {
        summary: this.cloneSummary(summary),
        totals,
        options: { dryRun: options.dryRun },
      },
    })
  }

  private async emitStageProgress(
    emitter: DataSyncProgressEmitter | undefined,
    payload: {
      stage: DataSyncProgressStage
      status: 'start' | 'complete'
      processed: number
      total: number
      summary: DataSyncResult['summary']
    },
  ): Promise<void> {
    if (!emitter) {
      return
    }

    await emitter({
      type: 'stage',
      payload: {
        stage: payload.stage,
        status: payload.status,
        processed: payload.processed,
        total: payload.total,
        summary: this.cloneSummary(payload.summary),
      },
    })
  }

  private async emitActionProgress(
    emitter: DataSyncProgressEmitter | undefined,
    payload: {
      stage: DataSyncProgressStage
      index: number
      total: number
      action: DataSyncAction
      summary: DataSyncResult['summary']
    },
  ): Promise<void> {
    if (!emitter) {
      return
    }

    await emitter({
      type: 'action',
      payload: {
        stage: payload.stage,
        index: payload.index,
        total: payload.total,
        action: this.cloneAction(payload.action),
        summary: this.cloneSummary(payload.summary),
      },
    })
  }

  private async emitComplete(emitter: DataSyncProgressEmitter | undefined, result: DataSyncResult): Promise<void> {
    if (!emitter) {
      return
    }

    await emitter({
      type: 'complete',
      payload: {
        summary: this.cloneSummary(result.summary),
        actions: result.actions.map((action) => this.cloneAction(action)),
      },
    })
  }

  private cloneSummary(summary: DataSyncResult['summary']): DataSyncResultSummary {
    return { ...summary }
  }

  private cloneAction(action: DataSyncAction): DataSyncAction {
    const structuredCloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone

    if (!structuredCloneFn) {
      throw new Error('structuredClone is not available in the current runtime environment.')
    }

    return structuredCloneFn(action) as DataSyncAction
  }

  private buildStageTotals(context: SyncPreparation): DataSyncStageTotals {
    return {
      'missing-in-db': context.missingInDb.length,
      'orphan-in-db': context.orphanInDb.length,
      'metadata-conflicts': context.conflictCandidates.length,
      'status-reconciliation': context.statusReconciliation.length,
    }
  }

  private async ensureLivePhotoMap(
    context: SyncPreparation,
    dryRun: boolean,
  ): Promise<Map<string, StorageObject> | undefined> {
    if (dryRun || context.missingInDb.length === 0) {
      return undefined
    }

    if (context.livePhotoMap) {
      return context.livePhotoMap
    }

    const allObjects = await context.storageManager.listAllFiles()
    context.livePhotoMap = await context.storageManager.detectLivePhotos(allObjects)
    return context.livePhotoMap
  }

  private buildInsertPayload(payload: {
    tenantId: string
    storageProvider: string
    storageObject: StorageObject
    manifest: PhotoAssetManifest
    metadataHash: string | null
    photoId: string
    syncedAt: string
  }): PhotoAssetInsert {
    const snapshot = this.createStorageSnapshot(payload.storageObject)
    const now = this.nowIso()
    return {
      tenantId: payload.tenantId,
      photoId: payload.photoId,
      storageKey: payload.storageObject.key,
      storageProvider: payload.storageProvider,
      size: snapshot.size,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      metadataHash: payload.metadataHash,
      manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
      manifest: payload.manifest,
      syncStatus: 'synced',
      conflictReason: null,
      conflictPayload: null,
      syncedAt: payload.syncedAt,
      createdAt: now,
      updatedAt: now,
    }
  }

  private async safeProcessStorageObject(
    storageObject: StorageObject,
    builder: ReturnType<PhotoBuilderService['createBuilder']>,
    options: {
      existing?: PhotoManifestItem | null
      livePhotoMap?: Map<string, StorageObject>
    },
  ) {
    try {
      return await this.photoBuilderService.processPhotoFromStorageObject(storageObject, {
        existingItem: options.existing ?? undefined,
        livePhotoMap: options.livePhotoMap,
        processorOptions: {
          isForceMode: true,
          isForceManifest: true,
        },
        builder,
      })
    } catch (err) {
      this.logger.error('Failed to process storage object', err)
      return null
    }
  }

  private createStorageSnapshot(object: StorageObject): SyncObjectSnapshot {
    const lastModified = this.toIso(object.lastModified)
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

  private createRecordSnapshot(record: PhotoAssetRecord): SyncObjectSnapshot {
    const metadataHash =
      record.metadataHash ??
      this.computeMetadataHash({
        size: record.size ?? null,
        etag: record.etag ?? null,
        lastModified: record.lastModified ?? null,
      })

    return {
      size: record.size ?? null,
      etag: record.etag ?? null,
      lastModified: record.lastModified ?? null,
      metadataHash,
    }
  }

  private computeMetadataHash(parts: {
    size: number | null
    etag: string | null
    lastModified: string | null
  }): string | null {
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

  private mapRecordToConflict(record: PhotoAssetRecord): DataSyncConflict {
    return {
      id: record.id,
      storageKey: record.storageKey,
      photoId: record.photoId,
      reason: record.conflictReason ?? null,
      payload: this.mapConflictPayloadToResponse(record.conflictPayload),
      manifestVersion: record.manifestVersion,
      manifest: record.manifest,
      storageProvider: record.storageProvider,
      syncedAt: record.syncedAt,
      updatedAt: record.updatedAt,
    }
  }

  private mapConflictPayloadToResponse(payload: PhotoAssetConflictPayload | null): ConflictPayload | null {
    if (!payload) {
      return null
    }

    return {
      type: payload.type,
      storageSnapshot: this.fromConflictSnapshot(payload.storageSnapshot),
      recordSnapshot: this.fromConflictSnapshot(payload.recordSnapshot),
      incomingStorageKey: payload.incomingStorageKey ?? null,
    }
  }

  private createConflictPayload(
    type: PhotoAssetConflictPayload['type'],
    payload: {
      storageSnapshot?: SyncObjectSnapshot | null
      recordSnapshot?: SyncObjectSnapshot | null
      incomingStorageKey?: string | null
    },
  ): PhotoAssetConflictPayload {
    return {
      type,
      storageSnapshot: this.toConflictSnapshot(payload.storageSnapshot ?? null),
      recordSnapshot: this.toConflictSnapshot(payload.recordSnapshot ?? null),
      incomingStorageKey: payload.incomingStorageKey ?? null,
    }
  }

  private extractConstraintViolation(error: unknown): { code?: string; constraint?: string; message?: string } | null {
    if (!error) {
      return null
    }

    if (typeof error === 'string') {
      return { message: error }
    }

    if (typeof error !== 'object') {
      return null
    }

    const candidate = error as {
      code?: unknown
      constraint?: unknown
      constraint_name?: unknown
      message?: unknown
      cause?: unknown
    }

    const code = typeof candidate.code === 'string' ? candidate.code : undefined
    const constraint =
      typeof candidate.constraint === 'string'
        ? candidate.constraint
        : typeof candidate.constraint_name === 'string'
          ? candidate.constraint_name
          : undefined
    const message = typeof candidate.message === 'string' ? candidate.message : undefined

    if (code || constraint) {
      return { code, constraint, message }
    }

    if ('cause' in candidate && candidate.cause) {
      const causeResult = this.extractConstraintViolation(candidate.cause)
      if (causeResult) {
        return causeResult
      }
    }

    if (message && (message.includes('duplicate key value') || message.includes('unique constraint'))) {
      return { message }
    }

    return null
  }

  private isUniqueConstraintViolation(error: { code?: string; message?: string }): boolean {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return true
    }

    if (error.message?.includes('duplicate key value') && error.message.includes('unique constraint')) {
      return true
    }

    return false
  }

  private isPhotoIdConstraintViolation(error: { constraint?: string; message?: string }): boolean {
    if (error.constraint === UNIQUE_CONSTRAINT_PHOTO_ID) {
      return true
    }

    if (error.message?.includes(UNIQUE_CONSTRAINT_PHOTO_ID)) {
      return true
    }

    return false
  }

  private isStorageKeyConstraintViolation(error: { constraint?: string; message?: string }): boolean {
    if (error.constraint === UNIQUE_CONSTRAINT_STORAGE_KEY) {
      return true
    }

    if (error.message?.includes(UNIQUE_CONSTRAINT_STORAGE_KEY)) {
      return true
    }

    return false
  }

  private toConflictSnapshot(snapshot: SyncObjectSnapshot | null): PhotoAssetConflictSnapshot | null {
    if (!snapshot) {
      return null
    }

    return {
      size: snapshot.size,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      metadataHash: snapshot.metadataHash,
    }
  }

  private fromConflictSnapshot(snapshot: PhotoAssetConflictSnapshot | null | undefined): SyncObjectSnapshot | null {
    if (!snapshot) {
      return null
    }

    return {
      size: snapshot.size,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      metadataHash: snapshot.metadataHash,
    }
  }

  private nowIso(): string {
    return new Date().toISOString()
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  }

  private async resolveByStorage(
    record: PhotoAssetRecord,
    payload: PhotoAssetConflictPayload,
    options: ResolveConflictOptions,
    dryRun: boolean,
    tenantId: string,
    db: ReturnType<DbAccessor['get']>,
  ): Promise<DataSyncAction> {
    const { builderConfig, storageConfig } = await this.resolveBuilderConfigForTenant(tenantId, options)

    const builder = this.photoBuilderService.createBuilder(builderConfig)
    const effectiveStorageConfig = options.storageConfig ?? storageConfig
    if (options.storageConfig) {
      this.photoBuilderService.applyStorageConfig(builder, options.storageConfig)
    }

    this.photoStorageService.registerStorageProviderPlugin(builder, effectiveStorageConfig)
    const storageManager = builder.getStorageManager()

    if (payload.type === 'missing-in-storage') {
      if (dryRun) {
        return {
          type: 'delete',
          storageKey: record.storageKey,
          photoId: record.photoId,
          applied: false,
          resolution: ConflictResolutionStrategy.PREFER_STORAGE,
          reason: 'Preview - would remove database record to match storage.',
          snapshots: {
            before: this.createRecordSnapshot(record),
          },
          manifestBefore: record.manifest.data,
          manifestAfter: null,
        }
      }

      await db.delete(photoAssets).where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))

      return {
        type: 'delete',
        storageKey: record.storageKey,
        photoId: record.photoId,
        applied: true,
        resolution: ConflictResolutionStrategy.PREFER_STORAGE,
        reason: 'Removed database record to align with storage.',
        snapshots: {
          before: this.createRecordSnapshot(record),
        },
        manifestBefore: record.manifest.data,
        manifestAfter: null,
      }
    }

    if (payload.type === 'photo-id-conflict') {
      const targetStorageKey = payload.incomingStorageKey
      if (!targetStorageKey) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: 'Conflict payload missing incoming storage key. Rerun data sync before resolving.',
        })
      }

      const storageObjects = await storageManager.listImages()
      const storageObject = storageObjects.find((object) => object.key === targetStorageKey)

      if (!storageObject) {
        throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
          message: 'Incoming storage object no longer exists; rerun data sync before resolving.',
        })
      }

      const processResult = await this.safeProcessStorageObject(storageObject, builder, {
        existing: record.manifest?.data as PhotoManifestItem | undefined,
      })
      if (!processResult?.item) {
        throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
          message: 'Failed to reprocess incoming storage object.',
        })
      }

      const storageSnapshot = this.createStorageSnapshot(storageObject)
      const manifestPayload = this.createManifestPayload(processResult.item)
      const now = this.nowIso()

      if (!dryRun) {
        await db
          .update(photoAssets)
          .set({
            photoId: processResult.item.id,
            storageKey: targetStorageKey,
            storageProvider: effectiveStorageConfig.provider,
            size: storageSnapshot.size,
            etag: storageSnapshot.etag,
            lastModified: storageSnapshot.lastModified,
            metadataHash: storageSnapshot.metadataHash,
            manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
            manifest: manifestPayload,
            syncStatus: 'synced',
            conflictReason: null,
            conflictPayload: null,
            syncedAt: now,
            updatedAt: now,
          })
          .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
      }

      return {
        type: 'update',
        storageKey: targetStorageKey,
        photoId: processResult.item.id,
        applied: !dryRun,
        resolution: ConflictResolutionStrategy.PREFER_STORAGE,
        reason: 'Updated record using incoming storage object after photo ID conflict.',
        snapshots: {
          before: this.createRecordSnapshot(record),
          after: storageSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: processResult.item,
      }
    }

    const storageObjects = await storageManager.listImages()
    const storageObject = storageObjects.find((object) => object.key === record.storageKey)

    if (!storageObject) {
      throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, {
        message: 'Storage object no longer exists; rerun data sync before resolving.',
      })
    }

    const processResult = await this.safeProcessStorageObject(storageObject, builder, {
      existing: record.manifest?.data as PhotoManifestItem | undefined,
    })
    if (!processResult?.item) {
      throw new BizException(ErrorCode.IMAGE_PROCESSING_FAILED, { message: 'Failed to reprocess storage object.' })
    }

    const storageSnapshot = this.createStorageSnapshot(storageObject)
    const manifestPayload = this.createManifestPayload(processResult.item)
    const now = this.nowIso()

    if (!dryRun) {
      await db
        .update(photoAssets)
        .set({
          photoId: processResult.item.id,
          storageProvider: effectiveStorageConfig.provider,
          size: storageSnapshot.size,
          etag: storageSnapshot.etag,
          lastModified: storageSnapshot.lastModified,
          metadataHash: storageSnapshot.metadataHash,
          manifestVersion: CURRENT_PHOTO_MANIFEST_VERSION,
          manifest: manifestPayload,
          syncStatus: 'synced',
          conflictReason: null,
          conflictPayload: null,
          syncedAt: now,
          updatedAt: now,
        })
        .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
    }

    return {
      type: 'update',
      storageKey: record.storageKey,
      photoId: processResult.item.id,
      applied: !dryRun,
      resolution: ConflictResolutionStrategy.PREFER_STORAGE,
      reason: 'Updated record using latest storage metadata.',
      snapshots: {
        before: this.createRecordSnapshot(record),
        after: storageSnapshot,
      },
      manifestBefore: record.manifest.data,
      manifestAfter: processResult.item,
    }
  }

  private async resolveByDatabase(
    record: PhotoAssetRecord,
    payload: PhotoAssetConflictPayload,
    dryRun: boolean,
    tenantId: string,
    db: ReturnType<DbAccessor['get']>,
  ): Promise<DataSyncAction> {
    const recordSnapshot = this.createRecordSnapshot(record)

    if (payload.type === 'missing-in-storage') {
      if (dryRun) {
        return {
          type: 'update',
          storageKey: record.storageKey,
          photoId: record.photoId,
          applied: false,
          resolution: ConflictResolutionStrategy.PREFER_DATABASE,
          reason: 'Preview - would retain database record despite missing storage.',
          snapshots: {
            before: recordSnapshot,
          },
          manifestBefore: record.manifest.data,
          manifestAfter: record.manifest.data,
        }
      }

      const now = this.nowIso()
      await db
        .update(photoAssets)
        .set({
          storageProvider: DATABASE_ONLY_PROVIDER,
          syncStatus: 'synced',
          conflictReason: null,
          conflictPayload: null,
          syncedAt: now,
          updatedAt: now,
        })
        .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))

      return {
        type: 'update',
        storageKey: record.storageKey,
        photoId: record.photoId,
        applied: true,
        resolution: ConflictResolutionStrategy.PREFER_DATABASE,
        reason: 'Marked record as database-only after missing storage reconciliation.',
        snapshots: {
          before: recordSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: record.manifest.data,
      }
    }

    const storageSnapshot = this.fromConflictSnapshot(payload.storageSnapshot)
    if (!storageSnapshot) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'Missing storage snapshot to resolve metadata mismatch.',
      })
    }

    if (payload.type === 'photo-id-conflict') {
      if (dryRun) {
        return {
          type: 'update',
          storageKey: record.storageKey,
          photoId: record.photoId,
          applied: false,
          resolution: ConflictResolutionStrategy.PREFER_DATABASE,
          reason: 'Preview - would keep existing database record despite duplicate photo ID.',
          snapshots: {
            before: recordSnapshot,
            after: storageSnapshot,
          },
          manifestBefore: record.manifest.data,
          manifestAfter: record.manifest.data,
        }
      }

      const now = this.nowIso()
      await db
        .update(photoAssets)
        .set({
          syncStatus: 'synced',
          conflictReason: null,
          conflictPayload: null,
          syncedAt: now,
          updatedAt: now,
        })
        .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))

      return {
        type: 'update',
        storageKey: record.storageKey,
        photoId: record.photoId,
        applied: true,
        resolution: ConflictResolutionStrategy.PREFER_DATABASE,
        reason: 'Kept existing database record despite duplicate photo ID.',
        snapshots: {
          before: recordSnapshot,
          after: storageSnapshot,
        },
        manifestBefore: record.manifest.data,
        manifestAfter: record.manifest.data,
      }
    }

    if (!dryRun) {
      const now = this.nowIso()
      await db
        .update(photoAssets)
        .set({
          size: storageSnapshot.size,
          etag: storageSnapshot.etag,
          lastModified: storageSnapshot.lastModified,
          metadataHash: storageSnapshot.metadataHash,
          syncStatus: 'synced',
          conflictReason: null,
          conflictPayload: null,
          syncedAt: now,
          updatedAt: now,
        })
        .where(and(eq(photoAssets.id, record.id), eq(photoAssets.tenantId, tenantId)))
    }

    return {
      type: 'update',
      storageKey: record.storageKey,
      photoId: record.photoId,
      applied: !dryRun,
      resolution: ConflictResolutionStrategy.PREFER_DATABASE,
      reason: 'Marked conflict as resolved in favor of database manifest.',
      snapshots: {
        before: recordSnapshot,
        after: storageSnapshot,
      },
      manifestBefore: record.manifest.data,
      manifestAfter: record.manifest.data,
    }
  }
}
