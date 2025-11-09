import { Button } from '@afilmory/ui'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useMainPageLayout } from '~/components/layouts/MainPageLayout'

import { runPhotoSync } from '../../api'
import type { PhotoSyncProgressEvent, PhotoSyncResult, RunPhotoSyncPayload } from '../../types'

type PhotoSyncActionsProps = {
  onCompleted: (result: PhotoSyncResult, context: { dryRun: boolean }) => void
  onProgress?: (event: PhotoSyncProgressEvent) => void
  onError?: (error: Error) => void
}

export function PhotoSyncActions({ onCompleted, onProgress, onError }: PhotoSyncActionsProps) {
  const { setHeaderActionState } = useMainPageLayout()
  const [pendingMode, setPendingMode] = useState<'dry-run' | 'apply' | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const mutation = useMutation({
    mutationFn: async (variables: RunPhotoSyncPayload) => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        return await runPhotoSync(
          { dryRun: variables.dryRun ?? false },
          {
            signal: controller.signal,
            onEvent: (event) => {
              onProgress?.(event)
            },
          },
        )
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    onMutate: (variables) => {
      setPendingMode(variables.dryRun ? 'dry-run' : 'apply')
      setHeaderActionState({ disabled: true, loading: true })
    },
    onSuccess: (data, variables) => {
      onCompleted(data, { dryRun: variables.dryRun ?? false })
      const { inserted, updated, conflicts } = data.summary
      toast.success(variables.dryRun ? '同步预览完成' : '照片同步完成', {
        description: `新增 ${inserted} · 更新 ${updated} · 冲突 ${conflicts}`,
      })
    },
    onError: (error) => {
      const normalizedError = error instanceof Error ? error : new Error('照片同步失败，请稍后重试。')

      const { message } = normalizedError
      toast.error('同步失败', { description: message })
      onError?.(normalizedError)
    },
    onSettled: () => {
      setPendingMode(null)
      setHeaderActionState({ disabled: false, loading: false })
      abortRef.current = null
    },
  })

  const { isPending } = mutation

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      setHeaderActionState({ disabled: false, loading: false })
    }
  }, [setHeaderActionState])

  const handleSync = (dryRun: boolean) => {
    mutation.mutate({ dryRun })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        isLoading={isPending && pendingMode === 'dry-run'}
        onClick={() => handleSync(true)}
      >
        预览同步
      </Button>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isPending}
        isLoading={isPending && pendingMode === 'apply'}
        onClick={() => handleSync(false)}
      >
        同步照片
      </Button>
    </div>
  )
}
