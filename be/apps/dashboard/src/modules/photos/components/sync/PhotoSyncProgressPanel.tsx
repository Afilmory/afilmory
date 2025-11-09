import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'

import { getConflictTypeLabel, PHOTO_ACTION_TYPE_CONFIG } from '../../constants'
import type { PhotoSyncAction, PhotoSyncProgressStage, PhotoSyncProgressState } from '../../types'
import { BorderOverlay } from './PhotoSyncResultPanel'

const STAGE_CONFIG: Record<PhotoSyncProgressStage, { label: string; description: string }> = {
  'missing-in-db': {
    label: '导入新照片',
    description: '将存储中新对象同步至数据库',
  },
  'orphan-in-db': {
    label: '识别孤立记录',
    description: '标记数据库中缺失存储对象的条目',
  },
  'metadata-conflicts': {
    label: '校验元数据',
    description: '检测存储与数据库之间的元数据差异',
  },
  'status-reconciliation': {
    label: '状态对齐',
    description: '更新记录状态以匹配最新元数据',
  },
}

const STAGE_ORDER: PhotoSyncProgressStage[] = [
  'missing-in-db',
  'orphan-in-db',
  'metadata-conflicts',
  'status-reconciliation',
]

const STATUS_LABEL: Record<PhotoSyncProgressState['stages'][PhotoSyncProgressStage]['status'], string> = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
}

const SUMMARY_FIELDS: Array<{
  key: keyof PhotoSyncProgressState['summary']
  label: string
}> = [
  { key: 'inserted', label: '新增' },
  { key: 'updated', label: '更新' },
  { key: 'conflicts', label: '冲突' },
]

type PhotoSyncProgressPanelProps = {
  progress: PhotoSyncProgressState
}

function formatActionLabel(action: PhotoSyncAction) {
  const config = PHOTO_ACTION_TYPE_CONFIG[action.type]
  if (action.type === 'conflict' && action.conflictPayload) {
    const conflictLabel = getConflictTypeLabel(action.conflictPayload.type)
    const base = config?.label ?? '冲突'
    return `${base} · ${conflictLabel}`
  }
  return config?.label ?? action.type
}

export function PhotoSyncProgressPanel({ progress }: PhotoSyncProgressPanelProps) {
  const isErrored = Boolean(progress.error)
  const heading = isErrored ? '同步失败' : progress.dryRun ? '同步预览进行中' : '同步进行中'
  const subtitle = isErrored
    ? '同步过程中发生错误，请查看错误信息后重试。'
    : progress.dryRun
      ? '当前正在模拟同步操作，结果仅用于预览，数据库不会发生变更。'
      : '正在对齐存储与数据库数据，请保持页面打开，稍后将展示同步结果。'
  const statusText = isErrored ? '已终止' : '进行中'

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
    label: field.label,
    value: progress.summary[field.key],
  }))

  const { lastAction } = progress

  return (
    <div className="bg-background-tertiary relative overflow-hidden rounded-lg p-6">
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
                <p className="text-text text-sm font-semibold">{item.config.label}</p>
                <p className="text-text-tertiary mt-1 text-xs">{item.config.description}</p>
              </div>
              <span className="text-text-tertiary text-xs font-medium">{STATUS_LABEL[item.status]}</span>
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
              {item.total > 0 ? `${item.processed} / ${item.total}` : '无需处理'}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="bg-background-secondary/60 border-border/20 rounded-lg border p-4">
            <p className="text-text-tertiary text-xs tracking-wide uppercase">{item.label}</p>
            <p className="text-text mt-2 text-xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      {lastAction ? (
        <div className="border-border/20 bg-fill/10 mt-6 overflow-hidden rounded-lg border p-4">
          <BorderOverlay />
          <p className="text-text-tertiary text-xs tracking-wide uppercase">最近处理</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="bg-accent/10 text-accent rounded-full px-2 py-0.5">
              {formatActionLabel(lastAction.action)}
            </span>
            <code className="text-text-secondary text-xs">{lastAction.action.storageKey}</code>
            <span className="text-text-tertiary text-xs">{STAGE_CONFIG[lastAction.stage].label}</span>
          </div>
          <p className="text-text-tertiary mt-2 text-xs">
            {lastAction.total > 0 ? `进度：${lastAction.index} / ${lastAction.total}` : '无需进一步处理'}
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
