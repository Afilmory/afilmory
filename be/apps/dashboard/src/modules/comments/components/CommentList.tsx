import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useCommentsQuery } from '../hooks'
import type { CommentResponseItem, UserViewModel } from '../types'
import { CommentItem } from './CommentItem'

interface CommentListProps {
  photoId: string
}

export function CommentList({ photoId }: CommentListProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useCommentsQuery(photoId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">
        {t('comments.error.loadFailed', { message: error?.message || t('comments.error.unknown') })}
      </div>
    )
  }

  if (!data?.pages[0]?.comments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
        <p className="text-sm">{t('comments.empty')}</p>
      </div>
    )
  }

  // Merge all pages
  const allComments: CommentResponseItem[] = []
  const allRelations: Record<string, CommentResponseItem> = {}
  const allUsers: Record<string, UserViewModel> = {}

  for (const page of data.pages) {
    allComments.push(...page.comments)
    Object.assign(allRelations, page.relations)
    Object.assign(allUsers, page.users)
  }

  return (
    <div className="space-y-3">
      {allComments.map((comment) => {
        const user = allUsers[comment.userId]
        const parentComment = comment.parentId ? allRelations[comment.parentId] : undefined
        const parentUser = parentComment ? allUsers[parentComment.userId] : undefined

        if (!user) {
          return null
        }

        return (
          <CommentItem
            key={comment.id}
            comment={comment}
            user={user}
            parentComment={parentComment}
            parentUser={parentUser}
            depth={comment.parentId ? 1 : 0}
          />
        )
      })}

      {/* Load More Button */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 rounded-lg bg-background-hover px-4 py-2 text-sm text-text transition-colors hover:bg-background-hover/80 disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('comments.list.loading')}</span>
              </>
            ) : (
              <span>{t('comments.list.loadMore')}</span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
