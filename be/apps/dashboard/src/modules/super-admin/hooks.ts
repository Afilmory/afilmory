import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchSuperAdminSettings,
  fetchSuperAdminTenantPhotos,
  fetchSuperAdminTenants,
  updateSuperAdminSettings,
  updateSuperAdminTenantBan,
  updateSuperAdminTenantPlan,
} from './api'
import type {
  SuperAdminSettingsResponse,
  SuperAdminTenantListResponse,
  SuperAdminTenantPhotosResponse,
  UpdateSuperAdminSettingsPayload,
  UpdateTenantBanPayload,
  UpdateTenantPlanPayload,
} from './types'

export const SUPER_ADMIN_SETTINGS_QUERY_KEY = ['super-admin', 'settings'] as const
export const SUPER_ADMIN_TENANTS_QUERY_KEY = ['super-admin', 'tenants'] as const

export function useSuperAdminSettingsQuery() {
  return useQuery<SuperAdminSettingsResponse>({
    queryKey: SUPER_ADMIN_SETTINGS_QUERY_KEY,
    queryFn: fetchSuperAdminSettings,
    staleTime: 60 * 1000,
  })
}

export function useSuperAdminTenantsQuery() {
  return useQuery<SuperAdminTenantListResponse>({
    queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY,
    queryFn: fetchSuperAdminTenants,
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

export function useUpdateTenantPlanMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateTenantPlanPayload) => {
      await updateSuperAdminTenantPlan(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY })
    },
  })
}

export function useUpdateTenantBanMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateTenantBanPayload) => {
      await updateSuperAdminTenantBan(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY })
    },
  })
}

export function useSuperAdminTenantPhotosQuery(tenantId: string | undefined) {
  return useQuery<SuperAdminTenantPhotosResponse>({
    queryKey: [...SUPER_ADMIN_TENANTS_QUERY_KEY, tenantId, 'photos'],
    queryFn: () => fetchSuperAdminTenantPhotos(tenantId!),
    enabled: !!tenantId,
  })
}
