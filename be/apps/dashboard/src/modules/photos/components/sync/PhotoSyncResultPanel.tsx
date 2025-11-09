import { Button } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useMemo, useState } from 'react'

import { getConflictTypeLabel, PHOTO_ACTION_TYPE_CONFIG } from '../../constants'
import type { PhotoAssetSummary, PhotoSyncAction, PhotoSyncResult, PhotoSyncSnapshot } from '../../types'

export function BorderOverlay() {
  return (
    <>
      <div className="via-text/20 absolute top-0 right-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-text/20 absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
      <div className="via-text/20 absolute right-0 bottom-0 left-0 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />
      <div className="via-text/20 absolute top-0 bottom-0 left-0 w-[0.5px] bg-linear-to-b from-transparent to-transparent" />
    </>
  )
}

type SummaryCardProps = {
  label: string
  value: number
  tone?: 'accent' | 'warning' | 'muted'
}

function SummaryCard({ label, value, tone }: SummaryCardProps) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'warning'
        ? 'text-amber-400'
        : tone === 'muted'
          ? 'text-text-secondary'
          : 'text-text'

  return (
    <div className="bg-background-tertiary relative overflow-hidden rounded-lg p-5">
      <BorderOverlay />
      <p className="text-text-tertiary text-xs tracking-wide uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

type PhotoSyncResultPanelProps = {
  result: PhotoSyncResult | null
  lastWasDryRun: boolean | null
  baselineSummary?: PhotoAssetSummary | null
  isSummaryLoading?: boolean
  onRequestStorageUrl?: (storageKey: string) => Promise<string>
}

const actionTypeConfig = PHOTO_ACTION_TYPE_CONFIG

const SUMMARY_SKELETON_KEYS = ['summary-skeleton-1', 'summary-skeleton-2', 'summary-skeleton-3', 'summary-skeleton-4']

export function PhotoSyncResultPanel({
  result,
  lastWasDryRun,
  baselineSummary,
  isSummaryLoading,
  onRequestStorageUrl,
}: PhotoSyncResultPanelProps) {
  const summaryItems = useMemo(() => {
    if (result) {
      return [
        { label: '存储对象', value: result.summary.storageObjects },
        { label: '数据库记录', value: result.summary.databaseRecords },
        {
          label: '新增照片',
          value: result.summary.inserted,
          tone: 'accent' as const,
        },
        { label: '更新记录', value: result.summary.updated },
        { label: '删除记录', value: result.summary.deleted },
        {
          label: '冲突条目',
          value: result.summary.conflicts,
          tone: result.summary.conflicts > 0 ? ('warning' as const) : ('muted' as const),
        },
        {
          label: '跳过条目',
          value: result.summary.skipped,
          tone: 'muted' as const,
        },
      ]
    }

    if (baselineSummary) {
      return [
        { label: '数据库记录', value: baselineSummary.total },
        { label: '同步完成', value: baselineSummary.synced },
        {
          label: '冲突条目',
          value: baselineSummary.conflicts,
          tone: baselineSummary.conflicts > 0 ? ('warning' as const) : ('muted' as const),
        },
        {
          label: '待处理',
          value: baselineSummary.pending,
          tone: baselineSummary.pending > 0 ? ('accent' as const) : ('muted' as const),
        },
      ]
    }

    return []
  }, [result, baselineSummary])

  const [selectedActionType, setSelectedActionType] = useState<'all' | PhotoSyncAction['type']>('all')
  const [expandedActionKey, setExpandedActionKey] = useState<string | null>(null)

  const actionFilters = useMemo(() => {
    const counts: Record<PhotoSyncAction['type'], number> = {
      insert: 0,
      update: 0,
      delete: 0,
      conflict: 0,
      noop: 0,
    }

    if (result) {
      for (const action of result.actions) {
        counts[action.type] = (counts[action.type] ?? 0) + 1
      }
    }

    return [
      {
        type: 'all' as const,
        label: '全部',
        count: result ? result.actions.length : 0,
      },
      ...Object.entries(actionTypeConfig).map(([type, config]) => ({
        type: type as PhotoSyncAction['type'],
        label: config.label,
        count: counts[type as PhotoSyncAction['type']] ?? 0,
      })),
    ]
  }, [result])

  const filteredActions = useMemo(() => {
    if (!result) {
      return [] as PhotoSyncAction[]
    }

    if (selectedActionType === 'all') {
      return result.actions
    }

    return result.actions.filter((action) => action.type === selectedActionType)
  }, [result, selectedActionType])

  const activeFilter = actionFilters.find((item) => item.type === selectedActionType)

  const handleSelectActionType = (type: 'all' | PhotoSyncAction['type']) => {
    setSelectedActionType(type)
    setExpandedActionKey(null)
  }

  const handleToggleAction = (key: string) => {
    setExpandedActionKey((prev) => (prev === key ? null : key))
  }

  const handleOpenOriginal = async (action: PhotoSyncAction) => {
    const manifest = action.manifestAfter ?? action.manifestBefore
    if (!manifest) return

    const candidate = manifest.originalUrl ?? manifest.thumbnailUrl
    if (candidate) {
      window.open(candidate, '_blank', 'noopener,noreferrer')
      return
    }

    if (!onRequestStorageUrl) return

    try {
      const url = await onRequestStorageUrl(action.storageKey)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`无法打开原图：${message}`)
    }
  }

  const renderActionDetails = (action: PhotoSyncAction) => {
    const { label, badgeClass } = actionTypeConfig[action.type]
    const {
      manifestBefore: beforeManifest,
      manifestAfter: afterManifest,
      conflictPayload,
      resolution,
      storageKey,
      photoId,
      applied,
    } = action
    const resolutionLabel =
      resolution === 'prefer-storage' ? '以存储为准' : resolution === 'prefer-database' ? '以数据库为准' : null
    const conflictTypeLabel = action.type === 'conflict' ? getConflictTypeLabel(conflictPayload?.type) : null

    return (
      <div className="border-border/20 bg-fill/10 relative overflow-hidden rounded-lg p-4">
        <BorderOverlay />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
              {label}
            </span>
            <code className="text-text-secondary text-xs">{storageKey}</code>
            {photoId ? <span className="text-text-tertiary text-xs">Photo ID：{photoId}</span> : null}
          </div>
          <span className="text-text-tertiary inline-flex items-center gap-1 text-xs">
            <span>{applied ? '已应用' : '未应用'}</span>
            {resolutionLabel ? <span>· {resolutionLabel}</span> : null}
          </span>
        </div>

        {action.reason ? <p className="text-text-tertiary text-sm">{action.reason}</p> : null}

        {conflictTypeLabel || conflictPayload?.incomingStorageKey ? (
          <div className="text-text-tertiary text-xs">
            {conflictTypeLabel ? <span>冲突类型：{conflictTypeLabel}</span> : null}
            {conflictPayload?.incomingStorageKey ? (
              <span className="ml-2">
                存储 Key：
                <code className="text-text ml-1 font-mono text-[11px]">{conflictPayload.incomingStorageKey}</code>
              </span>
            ) : null}
          </div>
        ) : null}

        {(beforeManifest || afterManifest) && (
          <div className="grid gap-3 md:grid-cols-2">
            <ManifestPreview title="数据库记录" manifest={beforeManifest} />
            <ManifestPreview
              title="存储对象"
              manifest={afterManifest}
              onOpenOriginal={() => handleOpenOriginal(action)}
            />
          </div>
        )}

        {action.snapshots ? (
          <div className="text-text-tertiary grid gap-4 text-xs md:grid-cols-2">
            {action.snapshots.before ? (
              <div>
                <p className="text-text font-semibold">元数据（数据库）</p>
                <MetadataSnapshot snapshot={action.snapshots.before} />
              </div>
            ) : null}
            {action.snapshots.after ? (
              <div>
                <p className="text-text font-semibold">元数据（存储）</p>
                <MetadataSnapshot snapshot={action.snapshots.after} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (!result) {
    return (
      <div className="bg-background-tertiary relative overflow-hidden rounded-lg p-6">
        <BorderOverlay />
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-text text-base font-semibold">尚未执行同步</h2>
            <p className="text-text-tertiary text-sm">
              请在系统设置中配置并激活存储提供商，然后使用右上角的按钮执行同步操作。预览模式不会写入数据，可用于安全检查。
            </p>
          </div>
          {isSummaryLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {SUMMARY_SKELETON_KEYS.map((key) => (
                <div key={key} className="bg-fill/30 h-24 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : summaryItems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => (
                <SummaryCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-text text-lg font-semibold">同步摘要</h2>
          <p className="text-text-tertiary text-sm">
            {lastWasDryRun === null
              ? '以下为最新同步结果。'
              : lastWasDryRun
                ? '最近执行了预览模式，数据库未发生变更。'
                : '最近一次同步结果已写入数据库。'}
          </p>
        </div>
        <p className="text-text-tertiary text-xs">
          <span>操作数：{filteredActions.length}</span>
          {result && selectedActionType !== 'all' ? (
            <span className="ml-1 inline-flex items-center gap-1">
              <span>· 筛选：</span>
              <span>{activeFilter?.label ?? ''}</span>
            </span>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {summaryItems.map((item, index) => (
          <m.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...Spring.presets.smooth, delay: index * 0.04 }}
          >
            <SummaryCard label={item.label} value={item.value} tone={item.tone} />
          </m.div>
        ))}
      </div>

      <div className="bg-background-tertiary relative overflow-hidden rounded-lg">
        <BorderOverlay />
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-text text-base font-semibold">同步操作明细</h3>
            <span className="text-text-tertiary text-xs">
              {lastWasDryRun ? '预览模式 · 未应用变更' : '实时模式 · 结果已写入'}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {actionFilters.map((filter) => (
              <Button
                key={filter.type}
                type="button"
                size="xs"
                variant={selectedActionType === filter.type ? 'primary' : 'ghost'}
                className="gap-1"
                onClick={() => handleSelectActionType(filter.type)}
              >
                <span>{filter.label}</span>
                <span className="text-text-tertiary text-[11px]">{filter.count}</span>
              </Button>
            ))}
          </div>

          {filteredActions.length === 0 ? (
            <p className="text-text-tertiary text-sm">
              {result ? '当前筛选下没有需要查看的操作。' : '同步完成，未检测到需要处理的对象。'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredActions.map((action, index) => {
                const actionKey = `${action.storageKey}-${action.type}-${action.photoId ?? 'none'}-${action.manifestAfter?.id ?? action.manifestBefore?.id ?? 'unknown'}`
                const { label, badgeClass } = actionTypeConfig[action.type]
                const resolutionLabel =
                  action.resolution === 'prefer-storage'
                    ? '以存储为准'
                    : action.resolution === 'prefer-database'
                      ? '以数据库为准'
                      : null
                const { conflictPayload } = action
                const conflictTypeLabel =
                  action.type === 'conflict' ? getConflictTypeLabel(conflictPayload?.type) : null
                const incomingKey = conflictPayload?.incomingStorageKey
                const isExpanded = expandedActionKey === actionKey

                return (
                  <m.div
                    key={actionKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...Spring.presets.snappy,
                      delay: index * 0.03,
                    }}
                  >
                    <div className="border-border/20 bg-fill/10 relative overflow-hidden rounded-lg">
                      <BorderOverlay />
                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                            >
                              {label}
                            </span>
                            <code className="text-text-secondary text-xs">{action.storageKey}</code>
                            {action.photoId ? (
                              <span className="text-text-tertiary text-xs">Photo ID：{action.photoId}</span>
                            ) : null}
                          </div>
                          <div className="text-text-tertiary flex flex-wrap items-center gap-2 text-xs">
                            <span>{action.applied ? '已应用' : '未应用'}</span>
                            {resolutionLabel ? <span>· {resolutionLabel}</span> : null}
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => handleToggleAction(actionKey)}
                            >
                              {isExpanded ? '收起详情' : '查看详情'}
                            </Button>
                          </div>
                        </div>

                        {action.reason ? <p className="text-text-tertiary text-sm">{action.reason}</p> : null}

                        {conflictTypeLabel || incomingKey ? (
                          <div className="text-text-tertiary text-xs">
                            {conflictTypeLabel ? <span>冲突类型：{conflictTypeLabel}</span> : null}
                            {incomingKey ? (
                              <span className="ml-2">
                                存储 Key：
                                <code className="text-text ml-1 font-mono text-[11px]">{incomingKey}</code>
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {isExpanded ? (
                          <div className="border-border/10 border-t pt-3">{renderActionDetails(action)}</div>
                        ) : null}
                      </div>
                    </div>
                  </m.div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ManifestPreview({
  title,
  manifest,
  onOpenOriginal,
}: {
  title: string
  manifest: PhotoSyncAction['manifestAfter'] | PhotoSyncAction['manifestBefore']
  onOpenOriginal?: () => void
}) {
  if (!manifest) {
    return (
      <div className="border-border/20 bg-background-secondary/60 text-text-tertiary rounded-md border p-3 text-xs">
        <p className="text-text text-sm font-semibold">{title}</p>
        <p className="mt-1">暂无数据</p>
      </div>
    )
  }

  const dimensions = manifest.width && manifest.height ? `${manifest.width} × ${manifest.height}` : '未知'
  const sizeMB =
    typeof manifest.size === 'number' && manifest.size > 0 ? `${(manifest.size / (1024 * 1024)).toFixed(2)} MB` : '未知'
  const updatedAt = manifest.lastModified ? new Date(manifest.lastModified).toLocaleString() : '未知'

  return (
    <div className="border-border/20 bg-background-secondary/60 rounded-md border p-3">
      <div className="flex items-start gap-3">
        {manifest.thumbnailUrl ? (
          <img src={manifest.thumbnailUrl} alt={manifest.id} className="h-16 w-20 rounded-md object-cover" />
        ) : null}
        <div className="text-text-tertiary space-y-1 text-xs">
          <p className="text-text text-sm font-semibold">{title}</p>
          <div className="flex items-center gap-2">
            <span className="text-text">ID：</span>
            <span className="truncate">{manifest.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text">尺寸：</span>
            <span>{dimensions}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text">大小：</span>
            <span>{sizeMB}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text">更新时间：</span>
            <span>{updatedAt}</span>
          </div>
        </div>
      </div>
      {onOpenOriginal ? (
        <Button type="button" variant="ghost" size="xs" className="mt-3" onClick={onOpenOriginal}>
          查看原图
        </Button>
      ) : null}
    </div>
  )
}

type MetadataSnapshotProps = {
  snapshot: PhotoSyncSnapshot | null | undefined
}

export function MetadataSnapshot({ snapshot }: MetadataSnapshotProps) {
  if (!snapshot) return null
  return (
    <dl className="mt-2 space-y-1">
      <div className="flex items-center justify-between gap-4">
        <dt>大小</dt>
        <dd className="text-text text-right">
          {snapshot.size !== null ? `${(snapshot.size / 1024 / 1024).toFixed(2)} MB` : '未知'}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt>ETag</dt>
        <dd className="text-text text-right font-mono text-[10px]">{snapshot.etag ?? '未知'}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt>更新时间</dt>
        <dd className="text-text text-right">{snapshot.lastModified ?? '未知'}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt>元数据摘要</dt>
        <dd className="text-text text-right font-mono text-[10px]">{snapshot.metadataHash ?? '无'}</dd>
      </div>
    </dl>
  )
}
