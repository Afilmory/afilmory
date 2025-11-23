import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { getActionTypeMeta, getConflictTypeLabel, PHOTO_ACTION_TYPE_CONFIG } from '../../constants'
import type { PhotoSyncAction, PhotoSyncLogLevel, PhotoSyncProgressStage, PhotoSyncProgressState } from '../../types'
import { BorderOverlay } from './PhotoSyncResultPanel'

const photoSyncProgressKeys = {
  heading: {
    error: 'photos.sync.progress.heading.error',
    preview: 'photos.sync.progress.heading.preview',
    running: 'photos.sync.progress.heading.running',
  },
  subtitle: {
    error: 'photos.sync.progress.subtitle.error',
    preview: 'photos.sync.progress.subtitle.preview',
    running: 'photos.sync.progress.subtitle.running',
  },
  status: {
    error: 'photos.sync.progress.status.error',
    running: 'photos.sync.progress.status.running',
  },
  stages: {
    missing: {
      label: 'photos.sync.progress.stages.missing.label',
      description: 'photos.sync.progress.stages.missing.description',
    },
    orphan: {
      label: 'photos.sync.progress.stages.orphan.label',
      description: 'photos.sync.progress.stages.orphan.description',
    },
    conflicts: {
      label: 'photos.sync.progress.stages.conflicts.label',
      description: 'photos.sync.progress.stages.conflicts.description',
    },
    reconciliation: {
      label: 'photos.sync.progress.stages.reconciliation.label',
      description: 'photos.sync.progress.stages.reconciliation.description',
    },
  },
  stageStatus: {
    pending: 'photos.sync.progress.stage-status.pending',
    running: 'photos.sync.progress.stage-status.running',
    completed: 'photos.sync.progress.stage-status.completed',
  },
  logs: {
    title: 'photos.sync.progress.logs.title',
    recent: 'photos.sync.progress.logs.recent',
  },
  logLevels: {
    info: 'photos.sync.progress.logs.level.info',
    success: 'photos.sync.progress.logs.level.success',
    warn: 'photos.sync.progress.logs.level.warn',
    error: 'photos.sync.progress.logs.level.error',
  },
  logDetails: {
    result: 'photos.sync.progress.logs.detail.result',
    manifest: 'photos.sync.progress.logs.detail.manifest',
    manifestAbsent: 'photos.sync.progress.logs.detail.manifest-absent',
    livePhoto: 'photos.sync.progress.logs.detail.live-photo',
    livePhotoAbsent: 'photos.sync.progress.logs.detail.live-photo-absent',
    error: 'photos.sync.progress.logs.detail.error',
  },
  recent: {
    title: 'photos.sync.progress.recent.title',
    progress: 'photos.sync.progress.recent.progress',
    noFurther: 'photos.sync.progress.recent.no-further',
  },
} as const satisfies {
  heading: Record<'error' | 'preview' | 'running', I18nKeys>
  subtitle: Record<'error' | 'preview' | 'running', I18nKeys>
  status: Record<'error' | 'running', I18nKeys>
  stages: {
    missing: { label: I18nKeys; description: I18nKeys }
    orphan: { label: I18nKeys; description: I18nKeys }
    conflicts: { label: I18nKeys; description: I18nKeys }
    reconciliation: { label: I18nKeys; description: I18nKeys }
  }
  stageStatus: Record<'pending' | 'running' | 'completed', I18nKeys>
  logs: { title: I18nKeys; recent: I18nKeys }
  logLevels: Record<'info' | 'success' | 'warn' | 'error', I18nKeys>
  logDetails: Record<'result' | 'manifest' | 'manifestAbsent' | 'livePhoto' | 'livePhotoAbsent' | 'error', I18nKeys>
  recent: Record<'title' | 'progress' | 'noFurther', I18nKeys>
}

const STAGE_CONFIG: Record<PhotoSyncProgressStage, { labelKey: I18nKeys; descriptionKey: I18nKeys }> = {
  'missing-in-db': {
    labelKey: photoSyncProgressKeys.stages.missing.label,
    descriptionKey: photoSyncProgressKeys.stages.missing.description,
  },
  'orphan-in-db': {
    labelKey: photoSyncProgressKeys.stages.orphan.label,
    descriptionKey: photoSyncProgressKeys.stages.orphan.description,
  },
  'metadata-conflicts': {
    labelKey: photoSyncProgressKeys.stages.conflicts.label,
    descriptionKey: photoSyncProgressKeys.stages.conflicts.description,
  },
  'status-reconciliation': {
    labelKey: photoSyncProgressKeys.stages.reconciliation.label,
    descriptionKey: photoSyncProgressKeys.stages.reconciliation.description,
  },
}

const STAGE_ORDER: PhotoSyncProgressStage[] = [
  'missing-in-db',
  'orphan-in-db',
  'metadata-conflicts',
  'status-reconciliation',
]

const STATUS_LABEL: Record<PhotoSyncProgressState['stages'][PhotoSyncProgressStage]['status'], I18nKeys> = {
  pending: photoSyncProgressKeys.stageStatus.pending,
  running: photoSyncProgressKeys.stageStatus.running,
  completed: photoSyncProgressKeys.stageStatus.completed,
}

const LOG_LEVEL_CONFIG: Record<PhotoSyncLogLevel, { labelKey: I18nKeys; className: string }> = {
  info: {
    labelKey: photoSyncProgressKeys.logLevels.info,
    className: 'border border-sky-500/30 bg-sky-500/10 text-sky-200',
  },
  success: {
    labelKey: photoSyncProgressKeys.logLevels.success,
    className: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  warn: {
    labelKey: photoSyncProgressKeys.logLevels.warn,
    className: 'border border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
  error: {
    labelKey: photoSyncProgressKeys.logLevels.error,
    className: 'border border-rose-500/30 bg-rose-500/10 text-rose-200',
  },
}

const SUMMARY_FIELDS: Array<{
  key: keyof PhotoSyncProgressState['summary']
  labelKey: I18nKeys
}> = [
  { key: 'inserted', labelKey: PHOTO_ACTION_TYPE_CONFIG.insert.labelKey },
  { key: 'updated', labelKey: PHOTO_ACTION_TYPE_CONFIG.update.labelKey },
  { key: 'conflicts', labelKey: PHOTO_ACTION_TYPE_CONFIG.conflict.labelKey },
  { key: 'errors', labelKey: PHOTO_ACTION_TYPE_CONFIG.error.labelKey },
]

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatLogTimestamp(timestamp: number): string {
  try {
    return timeFormatter.format(timestamp)
  } catch {
    return '--:--:--'
  }
}

type PhotoSyncProgressPanelProps = {
  progress: PhotoSyncProgressState
}

function formatActionLabel(action: PhotoSyncAction) {
  const { label: baseLabel } = getActionTypeMeta(action.type)
  if (action.type === 'conflict' && action.conflictPayload) {
    const conflictLabel = getConflictTypeLabel(action.conflictPayload.type)
    return `${baseLabel} · ${conflictLabel}`
  }
  return baseLabel
}

export function PhotoSyncProgressPanel({ progress }: PhotoSyncProgressPanelProps) {
  const { t } = useTranslation()
  const isErrored = Boolean(progress.error)
  const heading = isErrored
    ? t(photoSyncProgressKeys.heading.error)
    : progress.dryRun
      ? t(photoSyncProgressKeys.heading.preview)
      : t(photoSyncProgressKeys.heading.running)
  const subtitle = isErrored
    ? t(photoSyncProgressKeys.subtitle.error)
    : progress.dryRun
      ? t(photoSyncProgressKeys.subtitle.preview)
      : t(photoSyncProgressKeys.subtitle.running)
  const statusText = isErrored ? t(photoSyncProgressKeys.status.error) : t(photoSyncProgressKeys.status.running)

  const stageItems = STAGE_ORDER.map((stage) => {
    const stageState = progress.stages[stage]
    const config = STAGE_CONFIG[stage]
    const total = stageState?.total ?? 0
    const processed = stageState?.processed ?? 0
    const status = stageState?.status ?? 'pending'
    const ratio = total > 0 ? Math.min(1, processed / total) : status === 'completed' ? 1 : 0

    return {
      stage,
      config,
      total,
      processed,
      status,
      ratio,
    }
  })

  const summaryItems = SUMMARY_FIELDS.map((field) => ({
    label: t(field.labelKey),
    value: progress.summary[field.key],
  }))

  const { lastAction } = progress
  const recentLogs = progress.logs.slice(-8).reverse()

  return (
    <div className="bg-background-tertiary relative overflow-hidden p-6">
      <BorderOverlay />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-text text-base font-semibold">{heading}</h2>
          <p className="text-text-tertiary mt-1 text-sm">{subtitle}</p>
        </div>
        <div className="text-text-tertiary flex items-center gap-2 text-sm">
          <span className="relative inline-flex h-3 w-3">
            {!isErrored ? <span className="bg-accent/40 absolute inset-0 animate-ping rounded-full" /> : null}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${isErrored ? 'bg-rose-500' : 'bg-accent'}`} />
          </span>
          <span>{statusText}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {stageItems.map((item) => (
          <div key={item.stage} className="border-border/20 bg-fill/10 relative overflow-hidden rounded-lg border p-4">
            <BorderOverlay />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-text text-sm font-semibold">{t(item.config.labelKey)}</p>
                <p className="text-text-tertiary mt-1 text-xs">{t(item.config.descriptionKey)}</p>
              </div>
              <span className="text-text-tertiary text-xs font-medium">{t(STATUS_LABEL[item.status])}</span>
            </div>
            <div className="bg-fill/30 mt-3 h-1.5 rounded-full">
              <m.div
                className="bg-accent h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${item.ratio * 100}%` }}
                transition={Spring.presets.snappy}
              />
            </div>
            <div className="text-text-tertiary mt-2 text-xs">
              {item.total > 0
                ? t('photos.sync.progress.stages.progress', { processed: item.processed, total: item.total })
                : t(photoSyncProgressKeys.recent.noFurther)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="bg-background-secondary/60 border-border/20 rounded-lg border p-4">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">{item.label}</p>
            <p className="text-text mt-2 text-xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      {recentLogs.length > 0 ? (
        <div className="border-border/20 bg-fill/10 mt-6 overflow-hidden rounded-lg border p-4">
          <BorderOverlay />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-text text-sm font-semibold">{t(photoSyncProgressKeys.logs.title)}</p>
            <span className="text-text-tertiary text-xs">
              {t(photoSyncProgressKeys.logs.recent, { count: recentLogs.length })}
            </span>
          </div>
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
            {recentLogs.map((log) => {
              const levelConfig = LOG_LEVEL_CONFIG[log.level]
              const details = (log.details ?? null) as Record<string, unknown> | null
              const photoId = details && typeof details['photoId'] === 'string' ? (details['photoId'] as string) : null
              const resultType =
                details && typeof details['resultType'] === 'string' ? (details['resultType'] as string) : null
              const error = details && typeof details['error'] === 'string' ? (details['error'] as string) : null
              const hasExisting =
                details && typeof details['hasExistingManifest'] === 'boolean'
                  ? (details['hasExistingManifest'] as boolean)
                  : null
              const hasLivePhotoMap =
                details && typeof details['hasLivePhotoMap'] === 'boolean'
                  ? (details['hasLivePhotoMap'] as boolean)
                  : null

              const detailSegments: string[] = []
              if (photoId) detailSegments.push(`ID ${photoId}`)
              if (resultType) detailSegments.push(t(photoSyncProgressKeys.logDetails.result, { value: resultType }))
              if (typeof hasExisting === 'boolean') {
                detailSegments.push(
                  hasExisting
                    ? t(photoSyncProgressKeys.logDetails.manifest)
                    : t(photoSyncProgressKeys.logDetails.manifestAbsent),
                )
              }
              if (typeof hasLivePhotoMap === 'boolean') {
                detailSegments.push(
                  hasLivePhotoMap
                    ? t(photoSyncProgressKeys.logDetails.livePhoto)
                    : t(photoSyncProgressKeys.logDetails.livePhotoAbsent),
                )
              }
              if (error) detailSegments.push(t(photoSyncProgressKeys.logDetails.error, { value: error }))

              return (
                <div
                  key={log.id}
                  className="bg-background-secondary/40 text-text flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs"
                >
                  <span className="text-text-tertiary tabular-nums">{formatLogTimestamp(log.timestamp)}</span>
                  <span className={`${levelConfig.className} rounded-full px-2 py-0.5 text-[11px] font-medium`}>
                    {t(levelConfig.labelKey)}
                  </span>
                  <span className="text-text">{log.message}</span>
                  {log.storageKey ? <code className="text-text-secondary">{log.storageKey}</code> : null}
                  {log.stage ? <span className="text-text-tertiary">{t(STAGE_CONFIG[log.stage].labelKey)}</span> : null}
                  {detailSegments.length > 0 ? (
                    <span className="text-text-tertiary">{detailSegments.join(' · ')}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {lastAction ? (
        <div className="border-border/20 bg-fill/10 mt-6 overflow-hidden rounded-lg border p-4">
          <BorderOverlay />
          <p className="text-text-tertiary text-xs tracking-wide uppercase">{t(photoSyncProgressKeys.recent.title)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="bg-accent/10 text-accent rounded-full px-2 py-0.5">
              {formatActionLabel(lastAction.action)}
            </span>
            <code className="text-text-secondary text-xs">{lastAction.action.storageKey}</code>
            <span className="text-text-tertiary text-xs">{t(STAGE_CONFIG[lastAction.stage].labelKey)}</span>
          </div>
          <p className="text-text-tertiary mt-2 text-xs">
            {lastAction.total > 0
              ? t(photoSyncProgressKeys.recent.progress, { processed: lastAction.index, total: lastAction.total })
              : t(photoSyncProgressKeys.recent.noFurther)}
          </p>
        </div>
      ) : null}

      {progress.error ? (
        <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {progress.error}
        </div>
      ) : null}
    </div>
  )
}
