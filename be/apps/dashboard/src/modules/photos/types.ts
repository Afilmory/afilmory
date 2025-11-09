import type { PhotoManifestItem } from '@afilmory/builder'

export type PhotoSyncActionType = 'insert' | 'update' | 'delete' | 'conflict' | 'noop'

export type PhotoSyncResolution = 'prefer-storage' | 'prefer-database' | undefined

export interface PhotoSyncSnapshot {
  size: number | null
  etag: string | null
  lastModified: string | null
  metadataHash: string | null
}

export interface PhotoSyncAction {
  type: PhotoSyncActionType
  storageKey: string
  photoId: string | null
  applied: boolean
  resolution?: PhotoSyncResolution
  reason?: string
  conflictId?: string | null
  conflictPayload?: PhotoSyncConflictPayload | null
  snapshots?: {
    before?: PhotoSyncSnapshot | null
    after?: PhotoSyncSnapshot | null
  }
  manifestBefore?: PhotoManifestItem | null
  manifestAfter?: PhotoManifestItem | null
}

export interface PhotoSyncResultSummary {
  storageObjects: number
  databaseRecords: number
  inserted: number
  updated: number
  deleted: number
  conflicts: number
  skipped: number
}

export interface PhotoSyncResult {
  summary: PhotoSyncResultSummary
  actions: PhotoSyncAction[]
}

export type PhotoSyncConflictType = 'missing-in-storage' | 'metadata-mismatch' | 'photo-id-conflict'

export interface PhotoSyncConflictPayload {
  type: PhotoSyncConflictType
  storageSnapshot?: PhotoSyncSnapshot | null
  recordSnapshot?: PhotoSyncSnapshot | null
  incomingStorageKey?: string | null
}

export interface PhotoSyncConflict {
  id: string
  storageKey: string
  photoId: string | null
  reason: string | null
  payload: PhotoSyncConflictPayload | null
  manifestVersion: string
  manifest: PhotoAssetManifestPayload
  storageProvider: string
  syncedAt: string
  updatedAt: string
}

export interface RunPhotoSyncPayload {
  dryRun?: boolean
}

export type PhotoSyncProgressStage = 'missing-in-db' | 'orphan-in-db' | 'metadata-conflicts' | 'status-reconciliation'

export interface PhotoSyncStageTotals {
  'missing-in-db': number
  'orphan-in-db': number
  'metadata-conflicts': number
  'status-reconciliation': number
}

export type PhotoSyncProgressEvent =
  | {
      type: 'start'
      payload: {
        summary: PhotoSyncResultSummary
        totals: PhotoSyncStageTotals
        options: { dryRun: boolean }
      }
    }
  | {
      type: 'stage'
      payload: {
        stage: PhotoSyncProgressStage
        status: 'start' | 'complete'
        processed: number
        total: number
        summary: PhotoSyncResultSummary
      }
    }
  | {
      type: 'action'
      payload: {
        stage: PhotoSyncProgressStage
        index: number
        total: number
        action: PhotoSyncAction
        summary: PhotoSyncResultSummary
      }
    }
  | {
      type: 'complete'
      payload: PhotoSyncResult
    }
  | {
      type: 'error'
      payload: {
        message: string
      }
    }

export type PhotoSyncStageStatus = 'pending' | 'running' | 'completed'

export interface PhotoSyncProgressState {
  dryRun: boolean
  summary: PhotoSyncResultSummary
  totals: PhotoSyncStageTotals
  stages: Record<
    PhotoSyncProgressStage,
    {
      status: PhotoSyncStageStatus
      processed: number
      total: number
    }
  >
  startedAt: number
  updatedAt: number
  lastAction?: {
    stage: PhotoSyncProgressStage
    index: number
    total: number
    action: PhotoSyncAction
  }
  error?: string
}

export interface PhotoAssetManifestPayload {
  version: string
  data: PhotoManifestItem
}

export interface PhotoAssetListItem {
  id: string
  photoId: string
  storageKey: string
  storageProvider: string
  manifest: PhotoAssetManifestPayload
  syncedAt: string
  updatedAt: string
  createdAt: string
  publicUrl: string | null
  size: number | null
  syncStatus: 'pending' | 'synced' | 'conflict'
}

export interface PhotoAssetSummary {
  total: number
  synced: number
  conflicts: number
  pending: number
}
