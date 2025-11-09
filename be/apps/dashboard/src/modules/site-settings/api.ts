import { coreApi } from '~/lib/api-client'

import type { SiteSettingEntryInput, SiteSettingUiSchemaResponse } from './types'

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
