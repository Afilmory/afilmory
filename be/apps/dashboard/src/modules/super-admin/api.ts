import { getI18n } from '~/i18n'
import { coreApi, coreApiBaseURL } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'
import { withLanguageHeaderInit } from '~/lib/request-language'

import type { StorageProvider } from '../storage-providers/types'
import type {
  BuilderDebugProgressEvent,
  BuilderDebugResult,
  CleanupCandidatesResponse,
  CleanupCriteria,
  CleanupMode,
  CleanupPendingItem,
  CleanupResult,
  CleanupSubjectType,
  ManagedStorageProbeResult,
  SuperAdminAuditLogResponse,
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

const SUPER_ADMIN_SETTINGS_ENDPOINT = '/super-admin/settings'
const SUPER_ADMIN_TENANTS_ENDPOINT = '/super-admin/tenants'
const SUPER_ADMIN_STORAGE_TENANTS_ENDPOINT = '/super-admin/tenants/storage'
const SUPER_ADMIN_STORAGE_PROBE_ENDPOINT = '/super-admin/storage-providers/test-upload'
const SUPER_ADMIN_USERS_ENDPOINT = '/super-admin/users'
const SUPER_ADMIN_TENANT_CLEANUP_ENDPOINT = '/super-admin/tenant-cleanup'
const SUPER_ADMIN_AUDIT_ENDPOINT = '/super-admin/audit-logs'
const STABLE_NEWLINE = /\r?\n/

type RunBuilderDebugOptions = {
  signal?: AbortSignal
  onEvent?: (event: BuilderDebugProgressEvent) => void
}

export async function fetchSuperAdminSettings() {
  return await coreApi<SuperAdminSettingsResponse>(`${SUPER_ADMIN_SETTINGS_ENDPOINT}`, {
    method: 'GET',
  })
}

export async function updateSuperAdminSettings(payload: UpdateSuperAdminSettingsPayload) {
  const sanitizedEntries = Object.entries(payload).filter(([, value]) => value !== undefined)
  const body = Object.fromEntries(sanitizedEntries)

  return await coreApi<SuperAdminSettingsResponse>(`${SUPER_ADMIN_SETTINGS_ENDPOINT}`, {
    method: 'PATCH',
    body,
  })
}

export async function testSuperAdminStorageUpload(
  provider: StorageProvider,
  file: File,
): Promise<ManagedStorageProbeResult> {
  const formData = new FormData()
  formData.append('provider', JSON.stringify(provider))
  formData.append('file', file)

  const response = await coreApi<ManagedStorageProbeResult>(SUPER_ADMIN_STORAGE_PROBE_ENDPOINT, {
    method: 'POST',
    body: formData,
  })

  return camelCaseKeys<ManagedStorageProbeResult>(response)
}

export async function fetchSuperAdminTenants(
  params?: SuperAdminTenantListParams,
): Promise<SuperAdminTenantListResponse> {
  const query = new URLSearchParams()
  if (params) {
    if (params.page) {
      query.set('page', String(params.page))
    }
    if (params.limit) {
      query.set('limit', String(params.limit))
    }
    if (params.search) {
      query.set('search', params.search)
    }
    if (params.status) {
      query.set('status', params.status)
    }
    if (params.sortBy) {
      query.set('sortBy', params.sortBy)
    }
    if (params.sortDir) {
      query.set('sortDir', params.sortDir)
    }
  }

  const queryString = query.toString()
  const url = queryString ? `${SUPER_ADMIN_TENANTS_ENDPOINT}?${queryString}` : SUPER_ADMIN_TENANTS_ENDPOINT

  const response = await coreApi<SuperAdminTenantListResponse>(url, {
    method: 'GET',
  })
  return camelCaseKeys<SuperAdminTenantListResponse>(response)
}

export async function fetchSuperAdminStorageTenants(
  params?: SuperAdminTenantListParams,
): Promise<SuperAdminTenantListResponse> {
  const query = new URLSearchParams()
  if (params) {
    if (params.page) {
      query.set('page', String(params.page))
    }
    if (params.limit) {
      query.set('limit', String(params.limit))
    }
    if (params.search) {
      query.set('search', params.search)
    }
    if (params.sortBy) {
      query.set('sortBy', params.sortBy)
    }
    if (params.sortDir) {
      query.set('sortDir', params.sortDir)
    }
  }

  const queryString = query.toString()
  const url = queryString
    ? `${SUPER_ADMIN_STORAGE_TENANTS_ENDPOINT}?${queryString}`
    : SUPER_ADMIN_STORAGE_TENANTS_ENDPOINT

  const response = await coreApi<SuperAdminTenantListResponse>(url, {
    method: 'GET',
  })

  return camelCaseKeys<SuperAdminTenantListResponse>(response)
}

export async function updateSuperAdminTenantPlan(payload: UpdateTenantPlanPayload): Promise<void> {
  await coreApi(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${payload.tenantId}/plan`, {
    method: 'PATCH',
    body: { planId: payload.planId },
  })
}

export async function updateSuperAdminTenantStoragePlan(payload: UpdateTenantStoragePlanPayload): Promise<void> {
  await coreApi(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${payload.tenantId}/storage-plan`, {
    method: 'PATCH',
    body: { storagePlanId: payload.storagePlanId },
  })
}

export async function updateSuperAdminTenantBan(payload: UpdateTenantBanPayload): Promise<void> {
  await coreApi(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${payload.tenantId}/ban`, {
    method: 'PATCH',
    body: { banned: payload.banned },
  })
}

export async function deleteSuperAdminTenant(tenantId: string): Promise<void> {
  await coreApi(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${tenantId}`, {
    method: 'DELETE',
  })
}

export async function runBuilderDebugTest(file: File, options?: RunBuilderDebugOptions): Promise<BuilderDebugResult> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(
    `${coreApiBaseURL}/super-admin/builder/debug`,
    withLanguageHeaderInit({
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
      },
      credentials: 'include',
      body: formData,
      signal: options?.signal,
    }),
  )

  if (!response.ok || !response.body) {
    throw new Error(
      getI18n().t('superadmin.builder-debug.api.request-failed', {
        status: response.status,
        statusText: response.statusText,
      }),
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalResult: BuilderDebugResult | null = null
  let lastErrorMessage: string | null = null

  const stageEvent = (rawEvent: string) => {
    const lines = rawEvent.split(STABLE_NEWLINE)
    let eventName: string | null = null
    const dataLines: string[] = []

    for (const line of lines) {
      if (!line) {
        continue
      }

      if (line.startsWith(':')) {
        continue
      }

      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (!eventName || dataLines.length === 0) {
      return
    }

    if (eventName !== 'progress') {
      return
    }

    const data = dataLines.join('\n')

    try {
      const parsed = camelCaseKeys<BuilderDebugProgressEvent>(JSON.parse(data))
      options?.onEvent?.(parsed)

      if (parsed.type === 'complete') {
        finalResult = parsed.payload
      }

      if (parsed.type === 'error') {
        lastErrorMessage = parsed.payload.message
      }
    }
    catch (error) {
      console.error('Failed to parse builder debug event', error)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        stageEvent(rawEvent)
        boundary = buffer.indexOf('\n\n')
      }
    }

    if (buffer.trim().length > 0) {
      stageEvent(buffer)
      buffer = ''
    }
  }
  finally {
    reader.releaseLock()
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage)
  }

  if (!finalResult) {
    throw new Error(getI18n().t('superadmin.builder-debug.api.missing-result'))
  }

  return camelCaseKeys<BuilderDebugResult>(finalResult)
}

export async function fetchSuperAdminTenantPhotos(tenantId: string): Promise<SuperAdminTenantPhotosResponse> {
  const response = await coreApi<SuperAdminTenantPhotosResponse>(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${tenantId}/photos`, {
    method: 'GET',
  })
  return camelCaseKeys<SuperAdminTenantPhotosResponse>(response)
}

export async function fetchSuperAdminUsers(params: SuperAdminUserListParams): Promise<SuperAdminUserListResponse> {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.set(key, String(value))
    }
  })
  const response = await coreApi<SuperAdminUserListResponse>(`${SUPER_ADMIN_USERS_ENDPOINT}?${query}`, {
    method: 'GET',
  })
  return camelCaseKeys(response)
}

export async function fetchSuperAdminUser(userId: string): Promise<SuperAdminUserDetailResponse> {
  const response = await coreApi<SuperAdminUserDetailResponse>(`${SUPER_ADMIN_USERS_ENDPOINT}/${userId}`, {
    method: 'GET',
  })
  return camelCaseKeys(response)
}

export async function updateSuperAdminUserBan(input: {
  userId: string
  banned: boolean
  reason?: string | null
  expiresAt?: string | null
}): Promise<void> {
  await coreApi(`${SUPER_ADMIN_USERS_ENDPOINT}/${input.userId}/ban`, {
    method: 'PATCH',
    body: { banned: input.banned, reason: input.reason, expiresAt: input.expiresAt },
  })
}

export async function revokeSuperAdminUserSessions(userId: string): Promise<{ revokedSessions: number }> {
  return await coreApi(`${SUPER_ADMIN_USERS_ENDPOINT}/${userId}/sessions`, { method: 'DELETE' })
}

export async function fetchCleanupCandidates(
  subjectType: CleanupSubjectType,
  criteria: CleanupCriteria,
): Promise<CleanupCandidatesResponse> {
  const params = new URLSearchParams({
    subjectType,
    inactiveMonths: String(criteria.inactiveMonths),
    maxPhotos: String(criteria.maxPhotos),
    maxStorageMb: String(criteria.maxStorageMb),
    onlyReported: String(criteria.onlyReported),
    minSuspendedDays: String(criteria.minSuspendedDays),
  })
  const response = await coreApi<CleanupCandidatesResponse>(
    `${SUPER_ADMIN_TENANT_CLEANUP_ENDPOINT}/candidates?${params.toString()}`,
    { method: 'GET' },
  )
  return camelCaseKeys(response)
}

export async function executeCleanup(input: {
  subjectType: CleanupSubjectType
  mode: CleanupMode
  criteria: CleanupCriteria
  ids: string[]
  confirmation: string
}): Promise<CleanupResult> {
  const response = await coreApi<CleanupResult>(`${SUPER_ADMIN_TENANT_CLEANUP_ENDPOINT}/batches`, {
    method: 'POST',
    body: input,
  })
  return camelCaseKeys(response)
}

export async function fetchCleanupPending(): Promise<{ items: CleanupPendingItem[] }> {
  const response = await coreApi<{ items: CleanupPendingItem[] }>(`${SUPER_ADMIN_TENANT_CLEANUP_ENDPOINT}/pending`, {
    method: 'GET',
  })
  return camelCaseKeys(response)
}

export async function cancelCleanupPending(itemId: string): Promise<{ cancelled: boolean }> {
  return await coreApi(`${SUPER_ADMIN_TENANT_CLEANUP_ENDPOINT}/pending/${itemId}`, { method: 'DELETE' })
}

export async function fetchSuperAdminAuditLogs(params: {
  page: number
  limit: number
}): Promise<SuperAdminAuditLogResponse> {
  const response = await coreApi<SuperAdminAuditLogResponse>(
    `${SUPER_ADMIN_AUDIT_ENDPOINT}?page=${params.page}&limit=${params.limit}`,
    { method: 'GET' },
  )
  return camelCaseKeys(response)
}
