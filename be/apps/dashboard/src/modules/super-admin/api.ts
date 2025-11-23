import { getI18n } from '~/i18n'
import { coreApi, coreApiBaseURL } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'
import { withLanguageHeaderInit } from '~/lib/request-language'

import type {
  BuilderDebugProgressEvent,
  BuilderDebugResult,
  SuperAdminSettingsResponse,
  SuperAdminTenantListResponse,
  SuperAdminTenantPhotosResponse,
  UpdateSuperAdminSettingsPayload,
  UpdateTenantBanPayload,
  UpdateTenantPlanPayload,
} from './types'

const SUPER_ADMIN_SETTINGS_ENDPOINT = '/super-admin/settings'
const SUPER_ADMIN_TENANTS_ENDPOINT = '/super-admin/tenants'
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

export async function fetchSuperAdminTenants(): Promise<SuperAdminTenantListResponse> {
  const response = await coreApi<SuperAdminTenantListResponse>(`${SUPER_ADMIN_TENANTS_ENDPOINT}`, {
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

export async function updateSuperAdminTenantBan(payload: UpdateTenantBanPayload): Promise<void> {
  await coreApi(`${SUPER_ADMIN_TENANTS_ENDPOINT}/${payload.tenantId}/ban`, {
    method: 'PATCH',
    body: { banned: payload.banned },
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
    } catch (error) {
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
  } finally {
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
