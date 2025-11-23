import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getManagedStorageOverview, updateManagedStoragePlan } from './api'
import type { ManagedStorageOverview } from './types'

export const MANAGED_STORAGE_PLAN_QUERY_KEY = ['billing', 'storage-plan'] as const

export function useManagedStoragePlansQuery() {
  return useQuery({
    queryKey: MANAGED_STORAGE_PLAN_QUERY_KEY,
    queryFn: getManagedStorageOverview,
  })
}

export function useUpdateManagedStoragePlanMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (planId: string | null) => updateManagedStoragePlan(planId),
    onSuccess: (data) => {
      queryClient.setQueryData<ManagedStorageOverview>(MANAGED_STORAGE_PLAN_QUERY_KEY, data)
    },
  })
}
