import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deletePhotoAssets,
  getPhotoAssetSummary,
  listPhotoAssets,
  listPhotoSyncConflicts,
  resolvePhotoSyncConflict,
  uploadPhotoAssets,
} from './api'
import type { PhotoAssetListItem, PhotoSyncResolution } from './types'

export const PHOTO_ASSET_SUMMARY_QUERY_KEY = ['photo-assets', 'summary'] as const
export const PHOTO_ASSET_LIST_QUERY_KEY = ['photo-assets', 'list'] as const
export const PHOTO_SYNC_CONFLICTS_QUERY_KEY = ['photo-sync', 'conflicts'] as const

export function usePhotoAssetSummaryQuery() {
  return useQuery({
    queryKey: PHOTO_ASSET_SUMMARY_QUERY_KEY,
    queryFn: getPhotoAssetSummary,
  })
}

export function usePhotoAssetListQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PHOTO_ASSET_LIST_QUERY_KEY,
    queryFn: listPhotoAssets,
    enabled: options?.enabled ?? true,
  })
}

export function usePhotoSyncConflictsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PHOTO_SYNC_CONFLICTS_QUERY_KEY,
    queryFn: listPhotoSyncConflicts,
    enabled: options?.enabled ?? true,
  })
}

export function useDeletePhotoAssetsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      await deletePhotoAssets(ids)
    },
    onSuccess: (_, ids) => {
      void queryClient.invalidateQueries({
        queryKey: PHOTO_ASSET_LIST_QUERY_KEY,
      })
      void queryClient.invalidateQueries({
        queryKey: PHOTO_ASSET_SUMMARY_QUERY_KEY,
      })
      // Optimistically remove deleted ids from cache if available
      queryClient.setQueryData<PhotoAssetListItem[] | undefined>(PHOTO_ASSET_LIST_QUERY_KEY, (previous) => {
        if (!previous) return previous
        const idSet = new Set(ids)
        return previous.filter((item) => !idSet.has(item.id))
      })
    },
  })
}

export function useUploadPhotoAssetsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (files: File[]) => {
      return await uploadPhotoAssets(files)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PHOTO_ASSET_LIST_QUERY_KEY,
      })
      void queryClient.invalidateQueries({
        queryKey: PHOTO_ASSET_SUMMARY_QUERY_KEY,
      })
    },
  })
}

export function useResolvePhotoSyncConflictMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: { id: string; strategy: PhotoSyncResolution; dryRun?: boolean }) => {
      return await resolvePhotoSyncConflict(variables.id, {
        strategy: variables.strategy,
        dryRun: variables.dryRun,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PHOTO_SYNC_CONFLICTS_QUERY_KEY,
      })
    },
  })
}
