import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { StorageProvider } from '../storage-providers/types'
import {
  cancelCleanupPending,
  deleteSuperAdminTenant,
  executeCleanup,
  fetchCleanupCandidates,
  fetchCleanupPending,
  fetchSuperAdminAuditLogs,
  fetchSuperAdminSettings,
  fetchSuperAdminStorageTenants,
  fetchSuperAdminTenantPhotos,
  fetchSuperAdminTenants,
  fetchSuperAdminUser,
  fetchSuperAdminUsers,
  revokeSuperAdminUserSessions,
  testSuperAdminStorageUpload,
  updateSuperAdminSettings,
  updateSuperAdminTenantBan,
  updateSuperAdminTenantPlan,
  updateSuperAdminTenantStoragePlan,
  updateSuperAdminUserBan,
} from './api'
import type {
  CleanupCriteria,
  CleanupSubjectType,
  SuperAdminSettingsResponse,
  SuperAdminTenantListParams,
  SuperAdminTenantListResponse,
  SuperAdminTenantPhotosResponse,
  SuperAdminUserDetailResponse,
  SuperAdminUserListParams,
  SuperAdminUserListResponse,
  UpdateSuperAdminSettingsPayload,
  UpdateTenantBanPayload,
  UpdateTenantPlanPayload,
  UpdateTenantStoragePlanPayload,
} from './types'

export const SUPER_ADMIN_SETTINGS_QUERY_KEY = ['super-admin', 'settings'] as const
export const SUPER_ADMIN_TENANTS_QUERY_KEY = ['super-admin', 'tenants'] as const
export const SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY = ['super-admin', 'tenants', 'storage'] as const
export const SUPER_ADMIN_USERS_QUERY_KEY = ['super-admin', 'users'] as const
export const SUPER_ADMIN_TENANT_CLEANUP_QUERY_KEY = ['super-admin', 'tenant-cleanup'] as const
export const SUPER_ADMIN_AUDIT_QUERY_KEY = ['super-admin', 'audit-logs'] as const

export function useSuperAdminSettingsQuery() {
  return useQuery<SuperAdminSettingsResponse>({
    queryKey: SUPER_ADMIN_SETTINGS_QUERY_KEY,
    queryFn: fetchSuperAdminSettings,
    staleTime: 60 * 1000,
  })
}

export function useSuperAdminTenantsQuery(params?: SuperAdminTenantListParams) {
  return useQuery<SuperAdminTenantListResponse>({
    queryKey: [...SUPER_ADMIN_TENANTS_QUERY_KEY, params],
    queryFn: () => fetchSuperAdminTenants(params),
    placeholderData: previousData => previousData,
  })
}

export function useSuperAdminStorageTenantsQuery(params?: SuperAdminTenantListParams) {
  return useQuery<SuperAdminTenantListResponse>({
    queryKey: [...SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY, params],
    queryFn: () => fetchSuperAdminStorageTenants(params),
    placeholderData: previousData => previousData,
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

export function useManagedStorageProbeMutation() {
  return useMutation({
    mutationFn: async ({ provider, file }: { provider: StorageProvider, file: File }) =>
      await testSuperAdminStorageUpload(provider, file),
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
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY })
    },
  })
}

export function useUpdateTenantStoragePlanMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdateTenantStoragePlanPayload) => {
      await updateSuperAdminTenantStoragePlan(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY })
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
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY })
    },
  })
}

export function useDeleteTenantMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tenantId: string) => {
      await deleteSuperAdminTenant(tenantId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_STORAGE_TENANTS_QUERY_KEY })
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

export function useSuperAdminUsersQuery(params: SuperAdminUserListParams) {
  return useQuery<SuperAdminUserListResponse>({
    queryKey: [...SUPER_ADMIN_USERS_QUERY_KEY, params],
    queryFn: () => fetchSuperAdminUsers(params),
    placeholderData: previousData => previousData,
  })
}

export function useSuperAdminUserQuery(userId: string | undefined) {
  return useQuery<SuperAdminUserDetailResponse>({
    queryKey: [...SUPER_ADMIN_USERS_QUERY_KEY, userId],
    queryFn: () => fetchSuperAdminUser(userId!),
    enabled: Boolean(userId),
  })
}

export function useUpdateSuperAdminUserBanMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSuperAdminUserBan,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_USERS_QUERY_KEY }),
  })
}

export function useRevokeSuperAdminUserSessionsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeSuperAdminUserSessions,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_USERS_QUERY_KEY }),
  })
}

export function useCleanupCandidatesQuery(subjectType: CleanupSubjectType, criteria: CleanupCriteria, enabled = false) {
  return useQuery({
    queryKey: [...SUPER_ADMIN_TENANT_CLEANUP_QUERY_KEY, 'candidates', subjectType, criteria],
    queryFn: () => fetchCleanupCandidates(subjectType, criteria),
    enabled,
  })
}

export function useCleanupPendingQuery(enabled = false) {
  return useQuery({
    queryKey: [...SUPER_ADMIN_TENANT_CLEANUP_QUERY_KEY, 'pending'],
    queryFn: fetchCleanupPending,
    enabled,
  })
}

function useCleanupInvalidation() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANTS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_USERS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_TENANT_CLEANUP_QUERY_KEY })
  }
}

export function useExecuteCleanupMutation() {
  const invalidate = useCleanupInvalidation()
  return useMutation({ mutationFn: executeCleanup, onSuccess: invalidate })
}

export function useCancelCleanupPendingMutation() {
  const invalidate = useCleanupInvalidation()
  return useMutation({ mutationFn: cancelCleanupPending, onSuccess: invalidate })
}

export function useSuperAdminAuditLogsQuery(page: number, limit = 50) {
  return useQuery({
    queryKey: [...SUPER_ADMIN_AUDIT_QUERY_KEY, page, limit],
    queryFn: () => fetchSuperAdminAuditLogs({ page, limit }),
    placeholderData: previousData => previousData,
  })
}
