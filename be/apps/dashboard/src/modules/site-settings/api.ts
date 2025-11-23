import { coreApi } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type {
  SiteAuthorProfile,
  SiteSettingEntryInput,
  SiteSettingUiSchemaResponse,
  TenantDomain,
  UpdateSiteAuthorPayload,
} from './types'

const SITE_SETTINGS_ENDPOINT = '/site/settings'

export async function getSiteSettingUiSchema() {
  return await coreApi<SiteSettingUiSchemaResponse>(`${SITE_SETTINGS_ENDPOINT}/ui-schema`)
}

export async function updateSiteSettings(entries: readonly SiteSettingEntryInput[]) {
  return await coreApi<{ updated: readonly SiteSettingEntryInput[] }>(`${SITE_SETTINGS_ENDPOINT}`, {
    method: 'POST',
    body: { entries },
  })
}

export async function getSiteAuthorProfile() {
  return camelCaseKeys<SiteAuthorProfile>(await coreApi<SiteAuthorProfile>(`${SITE_SETTINGS_ENDPOINT}/author`))
}

export async function updateSiteAuthorProfile(payload: UpdateSiteAuthorPayload) {
  return await coreApi<SiteAuthorProfile>(`${SITE_SETTINGS_ENDPOINT}/author`, {
    method: 'POST',
    body: payload,
  })
}

export async function listTenantDomains() {
  const result = await coreApi<{ domains: TenantDomain[] }>('/tenant/domains')
  return camelCaseKeys(result) as { domains: TenantDomain[] }
}

export async function requestTenantDomain(domain: string) {
  const result = await coreApi<{ domain: TenantDomain }>('/tenant/domains', {
    method: 'POST',
    body: { domain },
  })
  return camelCaseKeys(result) as { domain: TenantDomain }
}

export async function verifyTenantDomain(domainId: string) {
  const result = await coreApi<{ domain: TenantDomain }>(`/tenant/domains/${domainId}/verify`, {
    method: 'POST',
  })
  return camelCaseKeys(result) as { domain: TenantDomain }
}

export async function deleteTenantDomain(domainId: string) {
  return await coreApi<{ deleted: boolean }>(`/tenant/domains/${domainId}`, { method: 'DELETE' })
}
