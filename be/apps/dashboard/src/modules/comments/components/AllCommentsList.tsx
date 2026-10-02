import { Loader2, MessageSquare } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useAllCommentsQuery } from '../hooks'
import type { CommentResponseItem, CommentStatus, UserViewModel } from '../types'
import { CommentItem } from './CommentItem'

// ============================================================================
// Types
// ============================================================================

interface AllCommentsListProps {
  filters?: {
    photoId?: string
    status?: CommentStatus
  }
}

interface GroupedComment {
  comment: CommentResponseItem
  user: UserViewModel
  parentComment?: CommentResponseItem
  parentUser?: UserViewModel
}

interface PhotoGroup {
  photoId: string
  comments: GroupedComment[]
}

// ============================================================================
// Sub-components
// ============================================================================

const LoadingState = memo(() => {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
    </div>
  )
})

const ErrorState = memo(({ message }: { message: string }) => {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">
      {t('comments.error.loadFailed', { message })}
    </div>
  )
})

const EmptyState = memo(() => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
      <MessageSquare className="h-8 w-8 opacity-50" />
      <p className="text-sm">{t('comments.empty')}</p>
    </div>
  )
})

const PhotoGroupHeader = memo(({ photoId }: { photoId: string }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <span className="text-xs font-medium text-text-tertiary">{t('comments.photo.label')}</span>
      <code className="rounded bg-fill px-2 py-0.5 font-mono text-xs text-text-secondary">{photoId}</code>
    </div>
  )
})

const LoadMoreButton = memo(({
  isLoading,
  onClick,
}: {
  isLoading: boolean
  onClick: () => void
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-fill/50 hover:text-text disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('comments.list.loading')}</span>
          </>
        ) : (
          <span>{t('comments.list.loadMore')}</span>
        )}
      </button>
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const AllCommentsList = memo(({ filters }: AllCommentsListProps) => {
  const { data, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage }
    = useAllCommentsQuery(filters)

  // Group comments by photoId for better organization
  const groupedComments = useMemo(() => {
    if (!data?.pages[0]?.comments.length) {
      return []
    }

    const allComments: CommentResponseItem[] = []
    const allRelations: Record<string, CommentResponseItem> = {}
    const allUsers: Record<string, UserViewModel> = {}

    for (const page of data.pages) {
      allComments.push(...page.comments)
      Object.assign(allRelations, page.relations)
      Object.assign(allUsers, page.users)
    }

    // Group by photoId
    const groups = new Map<string, GroupedComment[]>()

    for (const comment of allComments) {
      const user = allUsers[comment.userId]
      if (!user) {
        continue
      }

      const parentComment = comment.parentId ? allRelations[comment.parentId] : undefined
      const parentUser = parentComment ? allUsers[parentComment.userId] : undefined

      const grouped: GroupedComment = { comment, user, parentComment, parentUser }

      if (!groups.has(comment.photoId)) {
        groups.set(comment.photoId, [])
      }
      groups.get(comment.photoId)!.push(grouped)
    }

    // Convert to array and sort by most recent
    const result: PhotoGroup[] = []
    for (const [photoId, comments] of groups) {
      result.push({ photoId, comments })
    }

    return result
  }, [data])

  const { t } = useTranslation()
  if (isLoading) {
    return <LoadingState />
  }
  if (isError) {
    return <ErrorState message={error?.message || t('comments.error.unknown')} />
  }
  if (groupedComments.length === 0) {
    return <EmptyState />
  }

  // If filtering by specific photoId, show flat list
  if (filters?.photoId) {
    const flatComments = groupedComments.flatMap(g => g.comments)
    return (
      <div className="space-y-2">
        {flatComments.map(({ comment, user, parentComment, parentUser }) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            user={user}
            parentComment={parentComment}
            parentUser={parentUser}
            depth={comment.parentId ? 1 : 0}
          />
        ))}

        {hasNextPage && <LoadMoreButton isLoading={isFetchingNextPage} onClick={() => fetchNextPage()} />}
      </div>
    )
  }

  // Otherwise show grouped by photo
  return (
    <div className="space-y-4">
      {groupedComments.map(group => (
        <div key={group.photoId} className="space-y-2">
          <PhotoGroupHeader photoId={group.photoId} />
          <div className="space-y-2">
            {group.comments.map(({ comment, user, parentComment, parentUser }) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                user={user}
                parentComment={parentComment}
                parentUser={parentUser}
                depth={comment.parentId ? 1 : 0}
              />
            ))}
          </div>
        </div>
      ))}

      {hasNextPage && <LoadMoreButton isLoading={isFetchingNextPage} onClick={() => fetchNextPage()} />}
    </div>
  )
})
