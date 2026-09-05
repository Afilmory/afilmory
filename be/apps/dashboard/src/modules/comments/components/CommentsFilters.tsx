import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@afilmory/ui'
import { X } from 'lucide-react'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import type { CommentStatus } from '../types'

interface CommentsFiltersProps {
  photoIdFilter: string
  statusFilter: CommentStatus | 'all'
  onPhotoIdChange: (value: string) => void
  onStatusChange: (value: CommentStatus | 'all') => void
  onClearAll: () => void
}

export const CommentsFilters = memo(
  ({ photoIdFilter, statusFilter, onPhotoIdChange, onStatusChange, onClearAll }: CommentsFiltersProps) => {
    const { t } = useTranslation()
    const handlePhotoIdChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onPhotoIdChange(e.target.value)
      },
      [onPhotoIdChange],
    )

    const handleStatusChange = useCallback(
      (value: string) => {
        onStatusChange(value as CommentStatus | 'all')
      },
      [onStatusChange],
    )

    const handleClearPhotoId = useCallback(() => {
      onPhotoIdChange('')
    }, [onPhotoIdChange])

    const hasActiveFilters = photoIdFilter || statusFilter !== 'all'

    return (
      <LinearBorderPanel className="bg-background-tertiary">
        <div className="p-5">
          <h3 className="mb-4 text-sm font-medium text-text">{t('comments.filters.title')}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Photo ID Filter */}
            <div className="space-y-2">
              <label htmlFor="photoId" className="block text-sm text-text">
                {t('comments.filters.photoId.label')}
              </label>
              <Input
                type="text"
                id="photoId"
                value={photoIdFilter}
                onChange={handlePhotoIdChange}
                placeholder={t('comments.filters.photoId.placeholder')}
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label htmlFor="status" className="block text-sm font-medium text-text">
                {t('comments.filters.status.label')}
              </label>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger id="status">
                  <SelectValue placeholder={t('comments.filters.status.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('comments.all.label')}</SelectItem>
                  <SelectItem value="approved">{t('comments.status.approved')}</SelectItem>
                  <SelectItem value="pending">{t('comments.status.pending')}</SelectItem>
                  <SelectItem value="hidden">{t('comments.status.hidden')}</SelectItem>
                  <SelectItem value="rejected">{t('comments.status.rejected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-secondary">{t('comments.filters.active.label')}</span>
              {photoIdFilter && (
                <FilterTag
                  label={t('comments.filters.active.photo', { value: photoIdFilter })}
                  onClear={handleClearPhotoId}
                />
              )}
              {statusFilter !== 'all' && (
                <FilterTag
                  label={t('comments.filters.active.status', { value: getStatusLabel(statusFilter, t) })}
                  onClear={() => onStatusChange('all')}
                />
              )}
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-text-tertiary transition-colors hover:text-text"
              >
                {t('comments.filters.active.clearAll')}
              </button>
            </div>
          )}
        </div>
      </LinearBorderPanel>
    )
  },
)

const FilterTag = memo(({ label, onClear }: { label: string, onClear: () => void }) => {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 inline-flex items-center justify-center transition-colors hover:text-accent/80"
      >
        <X className="size-3" />
      </button>
    </span>
  )
})

function getStatusLabel(
  status: CommentStatus,
  // eslint-disable-next-line ts/no-explicit-any
  t: any,
): string {
  const keyMap: Record<CommentStatus, I18nKeys> = {
    approved: 'comments.status.approved',
    pending: 'comments.status.pending',
    hidden: 'comments.status.hidden',
    rejected: 'comments.status.rejected',
  }
  return t(keyMap[status])
}
