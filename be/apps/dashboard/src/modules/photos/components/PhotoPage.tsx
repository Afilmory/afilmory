import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { PageTabs } from '~/components/navigation/PageTabs'
import { StorageProvidersManager } from '~/modules/storage-providers'

import { getPhotoStorageUrl } from '../api'
import {
  useDeletePhotoAssetsMutation,
  usePhotoAssetListQuery,
  usePhotoAssetSummaryQuery,
  usePhotoSyncConflictsQuery,
  useResolvePhotoSyncConflictMutation,
  useUploadPhotoAssetsMutation,
} from '../hooks'
import type {
  PhotoAssetListItem,
  PhotoSyncConflict,
  PhotoSyncProgressEvent,
  PhotoSyncProgressStage,
  PhotoSyncProgressState,
  PhotoSyncResolution,
  PhotoSyncResult,
} from '../types'
import { PhotoLibraryActionBar } from './library/PhotoLibraryActionBar'
import { PhotoLibraryGrid } from './library/PhotoLibraryGrid'
import { PhotoSyncActions } from './sync/PhotoSyncActions'
import { PhotoSyncConflictsPanel } from './sync/PhotoSyncConflictsPanel'
import { PhotoSyncProgressPanel } from './sync/PhotoSyncProgressPanel'
import { PhotoSyncResultPanel } from './sync/PhotoSyncResultPanel'

type PhotoPageTab = 'sync' | 'library' | 'storage'

const BATCH_RESOLVING_ID = '__batch__'

const STAGE_ORDER: PhotoSyncProgressStage[] = [
  'missing-in-db',
  'orphan-in-db',
  'metadata-conflicts',
  'status-reconciliation',
]

function createInitialStages(totals: PhotoSyncProgressState['totals']): PhotoSyncProgressState['stages'] {
  return STAGE_ORDER.reduce<PhotoSyncProgressState['stages']>(
    (acc, stage) => {
      const total = totals[stage]
      acc[stage] = {
        status: total === 0 ? 'completed' : 'pending',
        processed: 0,
        total,
      }
      return acc
    },
    {} as PhotoSyncProgressState['stages'],
  )
}

export function PhotoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTabParam = searchParams.get('tab')
  const normalizedInitialTab: PhotoPageTab =
    initialTabParam === 'library' || initialTabParam === 'storage' ? (initialTabParam as PhotoPageTab) : 'sync'
  const [activeTab, setActiveTab] = useState<PhotoPageTab>(normalizedInitialTab)
  const [result, setResult] = useState<PhotoSyncResult | null>(null)
  const [lastWasDryRun, setLastWasDryRun] = useState<boolean | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<PhotoSyncProgressState | null>(null)

  useEffect(() => {
    setActiveTab(normalizedInitialTab)
  }, [normalizedInitialTab])

  const summaryQuery = usePhotoAssetSummaryQuery()
  const listQuery = usePhotoAssetListQuery({ enabled: activeTab === 'library' })
  const deleteMutation = useDeletePhotoAssetsMutation()
  const uploadMutation = useUploadPhotoAssetsMutation()
  const conflictsQuery = usePhotoSyncConflictsQuery({
    enabled: activeTab === 'sync',
  })
  const resolveConflictMutation = useResolvePhotoSyncConflictMutation()

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const isListLoading = listQuery.isLoading || listQuery.isFetching

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      return [...prev, id]
    })
  }

  const handleClearSelection = () => {
    setSelectedIds([])
  }

  const handleProgressEvent = useCallback(
    (event: PhotoSyncProgressEvent) => {
      if (event.type === 'start') {
        const { summary, totals, options } = event.payload
        setSyncProgress({
          dryRun: options.dryRun,
          summary,
          totals,
          stages: createInitialStages(totals),
          startedAt: Date.now(),
          updatedAt: Date.now(),
          lastAction: undefined,
          error: undefined,
        })
        setResult(null)
        setLastWasDryRun(options.dryRun)
        return
      }

      if (event.type === 'complete') {
        setSyncProgress(null)
        return
      }

      if (event.type === 'error') {
        setSyncProgress((prev) =>
          prev
            ? {
                ...prev,
                error: event.payload.message,
                updatedAt: Date.now(),
              }
            : prev,
        )
        return
      }

      if (event.type === 'stage') {
        setSyncProgress((prev) => {
          if (!prev) {
            return prev
          }

          const { stage, status, processed, total, summary } = event.payload
          const nextStages = {
            ...prev.stages,
            [stage]: {
              status: status === 'complete' ? 'completed' : total === 0 ? 'completed' : 'running',
              processed,
              total,
            },
          }

          return {
            ...prev,
            summary,
            stages: nextStages,
            updatedAt: Date.now(),
          }
        })
        return
      }

      if (event.type === 'action') {
        setSyncProgress((prev) => {
          if (!prev) {
            return prev
          }

          const { stage, index, total, action, summary } = event.payload
          const nextStages = {
            ...prev.stages,
            [stage]: {
              status: total === 0 ? 'completed' : 'running',
              processed: index,
              total,
            },
          }

          return {
            ...prev,
            summary,
            stages: nextStages,
            lastAction: {
              stage,
              index,
              total,
              action,
            },
            updatedAt: Date.now(),
          }
        })
      }
    },
    [setResult, setLastWasDryRun],
  )

  const handleSyncError = useCallback((error: Error) => {
    setSyncProgress((prev) =>
      prev
        ? {
            ...prev,
            error: error.message,
            updatedAt: Date.now(),
          }
        : prev,
    )
  }, [])

  const handleDeleteAssets = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await deleteMutation.mutateAsync(ids)
      toast.success(`已删除 ${ids.length} 个资源`)
      setSelectedIds((prev) => prev.filter((item) => !ids.includes(item)))
      void listQuery.refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败，请稍后重试。'
      toast.error('删除失败', { description: message })
    }
  }

  const handleUploadAssets = async (files: FileList) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return
    try {
      await uploadMutation.mutateAsync(fileArray)
      toast.success(`成功上传 ${fileArray.length} 张图片`)
      void listQuery.refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请稍后重试。'
      toast.error('上传失败', { description: message })
    }
  }

  const handleResolveConflict = useCallback(
    async (conflict: PhotoSyncConflict, strategy: PhotoSyncResolution) => {
      if (!strategy) {
        return
      }
      setResolvingConflictId(conflict.id)
      try {
        const action = await resolveConflictMutation.mutateAsync({
          id: conflict.id,
          strategy,
        })
        toast.success('冲突已处理', {
          description:
            action.reason ??
            (strategy === 'prefer-storage' ? '已以存储数据覆盖数据库记录。' : '已保留数据库记录并忽略存储差异。'),
        })
        void conflictsQuery.refetch()
        void summaryQuery.refetch()
        void listQuery.refetch()
      } catch (error) {
        const message = error instanceof Error ? error.message : '处理冲突失败，请稍后重试。'
        toast.error('处理冲突失败', { description: message })
      } finally {
        setResolvingConflictId(null)
      }
    },
    [conflictsQuery, listQuery, resolveConflictMutation, summaryQuery],
  )

  const handleResolveConflictsBatch = useCallback(
    async (conflicts: PhotoSyncConflict[], strategy: PhotoSyncResolution) => {
      if (!strategy || conflicts.length === 0) {
        toast.info('请选择至少一个冲突条目')
        return
      }

      setResolvingConflictId(BATCH_RESOLVING_ID)
      let processed = 0
      const errors: string[] = []

      try {
        for (const conflict of conflicts) {
          try {
            await resolveConflictMutation.mutateAsync({
              id: conflict.id,
              strategy,
            })
            processed += 1
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }
      } finally {
        setResolvingConflictId(null)
      }

      if (processed > 0) {
        toast.success(`${strategy === 'prefer-storage' ? '以存储为准' : '以数据库为准'}处理 ${processed} 个冲突`)
      }

      if (errors.length > 0) {
        toast.error('部分冲突处理失败', {
          description: errors[0],
        })
      }

      if (processed > 0 || errors.length > 0) {
        void conflictsQuery.refetch()
        void summaryQuery.refetch()
        void listQuery.refetch()
      }
    },
    [conflictsQuery, resolveConflictMutation, summaryQuery, listQuery],
  )

  const handleOpenAsset = async (asset: PhotoAssetListItem) => {
    const manifest = asset.manifest?.data
    const candidate = manifest?.originalUrl ?? manifest?.thumbnailUrl ?? asset.publicUrl
    if (candidate) {
      window.open(candidate, '_blank', 'noopener,noreferrer')
      return
    }

    try {
      const url = await getPhotoStorageUrl(asset.storageKey)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法获取原图链接'
      toast.error('打开失败', { description: message })
    }
  }

  const handleDeleteSingle = (asset: PhotoAssetListItem) => {
    void handleDeleteAssets([asset.id])
  }

  const handleTabChange = (tab: PhotoPageTab) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams.toString())
    if (tab === 'sync') {
      next.delete('tab')
    } else {
      next.set('tab', tab)
    }
    setSearchParams(next, { replace: true })

    if (tab !== 'library') {
      setSelectedIds([])
    }
  }

  const showConflictsPanel =
    conflictsQuery.isLoading || conflictsQuery.isFetching || (conflictsQuery.data?.length ?? 0) > 0

  return (
    <MainPageLayout title="照片库" description="在此同步和管理服务器中的照片资产。">
      {activeTab !== 'storage' ? (
        <MainPageLayout.Actions>
          {activeTab === 'sync' ? (
            <PhotoSyncActions
              onCompleted={(data, context) => {
                setResult(data)
                setLastWasDryRun(context.dryRun)
                setSyncProgress(null)
                void summaryQuery.refetch()
                void listQuery.refetch()
              }}
              onProgress={handleProgressEvent}
              onError={handleSyncError}
            />
          ) : (
            <PhotoLibraryActionBar
              selectionCount={selectedIds.length}
              isUploading={uploadMutation.isPending}
              isDeleting={deleteMutation.isPending}
              onUpload={handleUploadAssets}
              onDeleteSelected={() => {
                void handleDeleteAssets(selectedIds)
              }}
              onClearSelection={handleClearSelection}
            />
          )}
        </MainPageLayout.Actions>
      ) : null}

      <div className="space-y-6">
        <PageTabs
          activeId={activeTab}
          onSelect={(id) => handleTabChange(id as PhotoPageTab)}
          items={[
            { id: 'sync', label: '同步结果' },
            { id: 'library', label: '图库管理' },
            { id: 'storage', label: '素材存储' },
          ]}
        />

        {activeTab === 'storage' ? (
          <StorageProvidersManager />
        ) : (
          <>
            {activeTab === 'sync' && syncProgress ? <PhotoSyncProgressPanel progress={syncProgress} /> : null}

            {activeTab === 'sync' ? (
              <div className="space-y-6">
                {showConflictsPanel ? (
                  <PhotoSyncConflictsPanel
                    conflicts={conflictsQuery.data}
                    isLoading={conflictsQuery.isLoading || conflictsQuery.isFetching}
                    resolvingId={resolvingConflictId}
                    isBatchResolving={resolvingConflictId === BATCH_RESOLVING_ID}
                    onResolve={handleResolveConflict}
                    onResolveBatch={handleResolveConflictsBatch}
                    onRequestStorageUrl={getPhotoStorageUrl}
                  />
                ) : null}
                <PhotoSyncResultPanel
                  result={result}
                  lastWasDryRun={lastWasDryRun}
                  baselineSummary={summaryQuery.data}
                  isSummaryLoading={summaryQuery.isLoading}
                  onRequestStorageUrl={getPhotoStorageUrl}
                />
              </div>
            ) : (
              <PhotoLibraryGrid
                assets={listQuery.data}
                isLoading={isListLoading}
                selectedIds={selectedSet}
                onToggleSelect={handleToggleSelect}
                onOpenAsset={handleOpenAsset}
                onDeleteAsset={handleDeleteSingle}
                isDeleting={deleteMutation.isPending}
              />
            )}
          </>
        )}
      </div>
    </MainPageLayout>
  )
}
