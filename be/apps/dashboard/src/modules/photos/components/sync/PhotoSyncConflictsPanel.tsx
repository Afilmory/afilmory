import { Button, Checkbox, Prompt } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getConflictTypeLabel, PHOTO_CONFLICT_TYPE_CONFIG } from '../../constants'
import type { PhotoSyncConflict, PhotoSyncResolution, PhotoSyncSnapshot } from '../../types'
import { BorderOverlay, MetadataSnapshot } from './PhotoSyncResultPanel'

type PhotoSyncConflictsPanelProps = {
  conflicts?: PhotoSyncConflict[]
  isLoading?: boolean
  resolvingId?: string | null
  isBatchResolving?: boolean
  onResolve?: (conflict: PhotoSyncConflict, strategy: PhotoSyncResolution) => Promise<void>
  onResolveBatch?: (conflicts: PhotoSyncConflict[], strategy: PhotoSyncResolution) => Promise<void>
  onRequestStorageUrl?: (storageKey: string) => Promise<string>
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function PhotoSyncConflictsPanel({
  conflicts,
  isLoading,
  resolvingId,
  isBatchResolving,
  onResolve,
  onResolveBatch,
  onRequestStorageUrl,
}: PhotoSyncConflictsPanelProps) {
  const sortedConflicts = useMemo(() => {
    if (!conflicts) return []
    return conflicts.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [conflicts])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    startTransition(() => {
      setSelectedIds((prev) => {
        if (prev.size === 0) {
          return prev
        }
        const next = new Set<string>()
        for (const conflict of sortedConflicts) {
          if (prev.has(conflict.id)) {
            next.add(conflict.id)
          }
        }
        if (next.size === prev.size) {
          let unchanged = true
          for (const id of prev) {
            if (!next.has(id)) {
              unchanged = false
              break
            }
          }
          if (unchanged) {
            return prev
          }
        }
        return next
      })
    })
  }, [sortedConflicts])

  const selectedConflicts = useMemo(
    () => sortedConflicts.filter((conflict) => selectedIds.has(conflict.id)),
    [sortedConflicts, selectedIds],
  )

  const hasSelection = selectedIds.size > 0
  const isAllSelected = sortedConflicts.length > 0 && selectedIds.size === sortedConflicts.length
  const allCheckboxState = isAllSelected ? true : hasSelection ? ('indeterminate' as const) : false

  const isProcessing = Boolean(resolvingId) || Boolean(isBatchResolving)

  const toggleSelection = (conflictId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(conflictId)
      } else {
        next.delete(conflictId)
      }
      return next
    })
  }

  const toggleAllSelection = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(sortedConflicts.map((conflict) => conflict.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const toggleExpand = (conflictId: string) => {
    setExpandedId((prev) => (prev === conflictId ? null : conflictId))
  }

  const handleOpenStorage = async (storageKey?: string | null) => {
    if (!storageKey || !onRequestStorageUrl) return
    try {
      const url = await onRequestStorageUrl(storageKey)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('无法打开存储对象', { description: message })
    }
  }

  const handleOpenManifest = (manifest?: PhotoSyncConflict['manifest']['data']) => {
    if (!manifest) {
      toast.info('当前记录没有原图链接')
      return
    }
    const candidate = manifest.originalUrl ?? manifest.thumbnailUrl
    if (!candidate) {
      toast.info('当前记录没有原图链接')
      return
    }
    window.open(candidate, '_blank', 'noopener,noreferrer')
  }

  const runBatchResolve = async (
    targets: PhotoSyncConflict[],
    strategy: PhotoSyncResolution,
    shouldClearSelection: boolean,
  ) => {
    if (targets.length === 0) {
      toast.info('请先选择需要处理的冲突条目')
      return
    }

    if (onResolveBatch) {
      try {
        await onResolveBatch(targets, strategy)
        if (shouldClearSelection) {
          setSelectedIds(new Set())
        }
      } catch {
        // 错误提示交由上层处理
      }
      return
    }

    if (!onResolve) {
      return
    }

    for (const conflict of targets) {
      await onResolve(conflict, strategy)
    }

    if (shouldClearSelection) {
      setSelectedIds(new Set())
    }
  }

  const confirmAction = (message: string, onConfirm: () => void | Promise<void>) => {
    if (typeof window === 'undefined') {
      return onConfirm()
    }

    Prompt.prompt({
      title: '确认操作',
      description: message,
      onConfirmText: '确认',
      onCancelText: '取消',
      onConfirm: async () => {
        await onConfirm()
      },
    })
  }

  const getStrategyLabel = (strategy: PhotoSyncResolution) =>
    strategy === 'prefer-storage' ? '以存储为准' : '以数据库为准'

  const buildBulkConfirmMessage = (strategy: PhotoSyncResolution, scope: 'all' | 'selected', count: number) => {
    const scopeLabel = scope === 'all' ? '全部待处理冲突' : `选中的 ${count} 个冲突`
    return `确认要将${scopeLabel}${getStrategyLabel(strategy)}处理吗？`
  }

  const buildSingleConfirmMessage = (strategy: PhotoSyncResolution, conflict: PhotoSyncConflict) => {
    const identifier = conflict.photoId ?? conflict.id
    return `确认要将冲突 ${identifier}${getStrategyLabel(strategy)}处理吗？`
  }

  const handleAcceptSelected = async (strategy: PhotoSyncResolution) => {
    if (selectedConflicts.length === 0) {
      toast.info('请先选择需要处理的冲突条目')
      return
    }

    return confirmAction(buildBulkConfirmMessage(strategy, 'selected', selectedConflicts.length), async () => {
      await runBatchResolve(selectedConflicts, strategy, true)
    })
  }

  const handleAcceptAll = async (strategy: PhotoSyncResolution) => {
    if (sortedConflicts.length === 0) {
      toast.info('当前没有待处理的冲突条目')
      return
    }

    return confirmAction(buildBulkConfirmMessage(strategy, 'all', sortedConflicts.length), async () => {
      await runBatchResolve(sortedConflicts, strategy, true)
    })
  }

  const handleResolve = async (conflict: PhotoSyncConflict, strategy: PhotoSyncResolution) => {
    if (!onResolve) return

    return confirmAction(buildSingleConfirmMessage(strategy, conflict), async () => {
      await onResolve(conflict, strategy)
      setSelectedIds((prev) => {
        if (!prev.has(conflict.id)) {
          return prev
        }
        const next = new Set(prev)
        next.delete(conflict.id)
        return next
      })
    })
  }

  if (!isLoading && sortedConflicts.length === 0) {
    return null
  }

  return (
    <div className="bg-background-tertiary relative overflow-hidden rounded-lg">
      <BorderOverlay />
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-text text-base font-semibold">待处理冲突</h3>
            <p className="text-text-tertiary mt-1 text-sm">
              这些冲突需要手动确认处理方式，可以批量选择以提升处理效率。
            </p>
          </div>
          <span className="text-text-tertiary text-xs">总计：{sortedConflicts.length}</span>
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-3">
            {[...Array.from({ length: 3 }).keys()].map((index) => (
              <div key={`conflict-skeleton-${index}`} className="bg-fill/20 h-28 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allCheckboxState}
                  disabled={isProcessing || sortedConflicts.length === 0}
                  onCheckedChange={(checked) => toggleAllSelection(Boolean(checked))}
                />
                <span className="text-text-tertiary text-xs">
                  {hasSelection ? `已选 ${selectedIds.size} 项` : '未选择条目'}
                </span>
                {hasSelection ? (
                  <Button type="button" variant="ghost" size="xs" disabled={isProcessing} onClick={clearSelection}>
                    清除选择
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {hasSelection ? (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={isProcessing}
                      onClick={() => void handleAcceptSelected('prefer-storage')}
                    >
                      选中存储为准
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={isProcessing}
                      onClick={() => void handleAcceptSelected('prefer-database')}
                    >
                      选中数据库为准
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={isProcessing || sortedConflicts.length === 0}
                      onClick={() => void handleAcceptAll('prefer-storage')}
                    >
                      全部以存储为准
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={isProcessing || sortedConflicts.length === 0}
                      onClick={() => void handleAcceptAll('prefer-database')}
                    >
                      全部以数据库为准
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sortedConflicts.map((conflict, index) => {
                const { payload } = conflict
                const typeLabel = getConflictTypeLabel(payload?.type)
                const typeConfig = payload?.type ? PHOTO_CONFLICT_TYPE_CONFIG[payload.type] : null
                const isSelected = selectedIds.has(conflict.id)
                const isResolving = Boolean(isBatchResolving) || resolvingId === conflict.id
                const storageKey = payload?.incomingStorageKey ?? conflict.storageKey

                return (
                  <m.div
                    key={`${conflict.id}-${conflict.updatedAt}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...Spring.presets.smooth,
                      delay: index * 0.04,
                    }}
                    className="border-border/20 bg-fill/10 relative overflow-hidden rounded-lg border"
                  >
                    <BorderOverlay />
                    <div className="flex items-start gap-3 p-5">
                      <Checkbox
                        checked={isSelected}
                        disabled={isProcessing}
                        onCheckedChange={(checked) => toggleSelection(conflict.id, Boolean(checked))}
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
                              {typeLabel}
                            </span>
                            <code className="text-text-secondary text-xs">{conflict.photoId ?? '未绑定 Photo ID'}</code>
                            {typeConfig ? (
                              <span className="text-text-tertiary text-xs">{typeConfig.description}</span>
                            ) : null}
                          </div>
                          <div className="text-text-tertiary flex flex-wrap justify-end gap-2 text-xs">
                            <span>上次更新：{formatDate(conflict.updatedAt)}</span>
                            <span>首次检测：{formatDate(conflict.syncedAt)}</span>
                          </div>
                        </div>

                        <div className="text-text-tertiary flex flex-wrap gap-3 text-xs">
                          <span>
                            存储 Key：
                            <code className="text-text ml-1 font-mono text-[11px]">{conflict.storageKey}</code>
                          </span>
                          {payload?.incomingStorageKey ? (
                            <span>
                              冲突 Key：
                              <code className="text-text ml-1 font-mono text-[11px]">{payload.incomingStorageKey}</code>
                            </span>
                          ) : null}
                        </div>

                        {expandedId === conflict.id ? (
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <ConflictManifestPreview
                                manifest={conflict.manifest?.data}
                                disabled={isProcessing}
                                onOpenOriginal={() => handleOpenManifest(conflict.manifest?.data)}
                              />
                              <ConflictStoragePreview
                                storageKey={storageKey}
                                snapshot={payload?.storageSnapshot ?? null}
                                disabled={isProcessing}
                                onOpenStorage={() => void handleOpenStorage(storageKey)}
                              />
                            </div>
                            <div className="text-text-tertiary grid gap-3 text-xs md:grid-cols-2">
                              <div>
                                <p className="text-text font-semibold">元数据（数据库）</p>
                                <MetadataSnapshot snapshot={payload?.recordSnapshot ?? null} />
                              </div>
                              <div>
                                <p className="text-text font-semibold">元数据（存储）</p>
                                <MetadataSnapshot snapshot={payload?.storageSnapshot ?? null} />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={isResolving || isProcessing}
                            onClick={() => void handleResolve(conflict, 'prefer-storage')}
                          >
                            以存储为准
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={isResolving || isProcessing}
                            onClick={() => void handleResolve(conflict, 'prefer-database')}
                          >
                            以数据库为准
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="primary"
                            disabled={isProcessing}
                            onClick={() => toggleExpand(conflict.id)}
                          >
                            {expandedId === conflict.id ? '收起详情' : '查看详情'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </m.div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ConflictManifestPreview({
  manifest,
  disabled,
  onOpenOriginal,
}: {
  manifest: PhotoSyncConflict['manifest']['data'] | null | undefined
  disabled?: boolean
  onOpenOriginal?: () => void
}) {
  if (!manifest) {
    return (
      <div className="border-border/20 bg-background-secondary/60 text-text-tertiary rounded-md border p-3 text-xs">
        <p className="text-text text-sm font-semibold">数据库记录</p>
        <p className="mt-1">暂无数据库记录</p>
      </div>
    )
  }

  const dimensions = manifest.width && manifest.height ? `${manifest.width} × ${manifest.height}` : '未知'
  const sizeMB =
    typeof manifest.size === 'number' && manifest.size > 0 ? `${(manifest.size / (1024 * 1024)).toFixed(2)} MB` : '未知'
  const updatedAt = manifest.lastModified ? new Date(manifest.lastModified).toLocaleString() : '未知'

  return (
    <div className="border-border/20 bg-background-secondary/60 text-text-tertiary rounded-md border p-3 text-xs">
      <div className="flex items-center gap-3">
        {manifest.thumbnailUrl ? (
          <img src={manifest.thumbnailUrl} alt={manifest.id} className="h-16 w-20 rounded-md object-cover" />
        ) : null}
        <div className="space-y-1">
          <p className="text-text text-sm font-semibold">数据库记录</p>
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
        <Button type="button" variant="ghost" size="xs" className="mt-3" disabled={disabled} onClick={onOpenOriginal}>
          查看原图
        </Button>
      ) : null}
    </div>
  )
}

function ConflictStoragePreview({
  storageKey,
  snapshot,
  disabled,
  onOpenStorage,
}: {
  storageKey: string
  snapshot: PhotoSyncSnapshot | null | undefined
  disabled?: boolean
  onOpenStorage?: () => void
}) {
  return (
    <div className="border-border/20 bg-background-secondary/60 text-text-tertiary rounded-md border p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-text text-sm font-semibold">存储对象</p>
        {onOpenStorage ? (
          <Button type="button" variant="ghost" size="xs" disabled={disabled} onClick={onOpenStorage}>
            打开
          </Button>
        ) : null}
      </div>
      <p className="mt-1 break-all">
        Key：
        <span className="text-text font-mono text-[11px]">{storageKey}</span>
      </p>
      <MetadataSnapshot snapshot={snapshot ?? null} />
    </div>
  )
}
