import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSuperAdminSettings, updateSuperAdminSettings } from './api'
import type { SuperAdminSettingsResponse, UpdateSuperAdminSettingsPayload } from './types'

export const SUPER_ADMIN_SETTINGS_QUERY_KEY = ['super-admin', 'settings'] as const

export function useSuperAdminSettingsQuery() {
  return useQuery<SuperAdminSettingsResponse>({
    queryKey: SUPER_ADMIN_SETTINGS_QUERY_KEY,
    queryFn: fetchSuperAdminSettings,
    staleTime: 60 * 1000,
  })
}

type SuperAdminSettingsMutationOptions = {
  onSuccess?: (data: SuperAdminSettingsResponse) => void
}

export function useUpdateSuperAdminSettingsMutation(options?: SuperAdminSettingsMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateSuperAdminSettingsPayload) => await updateSuperAdminSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SUPER_ADMIN_SETTINGS_QUERY_KEY, data)
      options?.onSuccess?.(data)
    },
  })
}
