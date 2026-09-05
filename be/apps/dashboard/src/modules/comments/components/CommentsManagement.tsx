import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { MainPageLayout } from '~/components/layouts/MainPageLayout'

import { ALL_COMMENTS_QUERY_KEY } from '../hooks'
import type { CommentStatus } from '../types'
import { AllCommentsList } from './AllCommentsList'
import { CommentsFilters } from './CommentsFilters'

export function CommentsManagement() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [photoIdFilter, setPhotoIdFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<CommentStatus | 'all'>('all')

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ALL_COMMENTS_QUERY_KEY })
  }, [queryClient])

  const handleClearAll = useCallback(() => {
    setPhotoIdFilter('')
    setStatusFilter('all')
  }, [])

  const filters = useMemo(
    () => ({
      photoId: photoIdFilter || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [photoIdFilter, statusFilter],
  )

  return (
    <MainPageLayout
      title={t('comments.page.title')}
      description={t('comments.page.description')}
      actions={<RefreshButton onClick={handleRefresh} />}
    >
      <div className="space-y-6">
        <CommentsFilters
          photoIdFilter={photoIdFilter}
          statusFilter={statusFilter}
          onPhotoIdChange={setPhotoIdFilter}
          onStatusChange={setStatusFilter}
          onClearAll={handleClearAll}
        />

        <LinearBorderPanel className="bg-background-tertiary">
          <div className="p-6">
            <h2 className="mb-4 text-base font-semibold text-text">{t('comments.page.allComments')}</h2>
            <AllCommentsList filters={filters} />
          </div>
        </LinearBorderPanel>
      </div>
    </MainPageLayout>
  )
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-fill/50 hover:text-text"
    >
      <RefreshCw className="h-4 w-4" />
      <span>{t('comments.page.refresh')}</span>
    </button>
  )
}
