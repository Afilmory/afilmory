import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { i18n } from '~/i18n'

import { commentsApi } from './api'
import type { CommentStatus } from './types'

export const COMMENTS_QUERY_KEY = ['comments'] as const
export const ALL_COMMENTS_QUERY_KEY = ['comments', 'all'] as const

export function useCommentsQuery(photoId: string, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: [...COMMENTS_QUERY_KEY, photoId],
    queryFn: ({ pageParam }) =>
      commentsApi.list({
        photoId,
        limit: 20,
        cursor: pageParam,
      }),
    getNextPageParam: lastPage => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: options?.enabled ?? true,
  })
}

export function useAllCommentsQuery(filters?: { photoId?: string, status?: CommentStatus }) {
  return useInfiniteQuery({
    queryKey: [...ALL_COMMENTS_QUERY_KEY, filters],
    queryFn: ({ pageParam }) =>
      commentsApi.listAll({
        limit: 20,
        cursor: pageParam,
        photoId: filters?.photoId,
        status: filters?.status,
      }),
    getNextPageParam: lastPage => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  })
}

export function useDeleteCommentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: commentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ALL_COMMENTS_QUERY_KEY })
      toast.success(i18n.t('comments.delete.toast.success'))
    },
    onError: (error: Error) => {
      toast.error(i18n.t('comments.delete.toast.error', { message: error.message }))
    },
  })
}
