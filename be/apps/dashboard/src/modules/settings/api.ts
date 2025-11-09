import { coreApi } from '~/lib/api-client'

import type { SettingEntryInput, SettingUiSchemaResponse } from './types'

const STORAGE_SETTINGS_ENDPOINT = '/storage/settings'

export async function getSettingUiSchema() {
  return await coreApi<SettingUiSchemaResponse>(`${STORAGE_SETTINGS_ENDPOINT}/ui-schema`)
}

export async function getSettings(keys: readonly string[]) {
  return await coreApi<{
    keys: string[]
    values: Record<string, string | null>
  }>(`${STORAGE_SETTINGS_ENDPOINT}/batch`, {
    body: { keys },
    method: 'POST',
  })
}

export async function updateSettings(entries: readonly SettingEntryInput[]) {
  return await coreApi<{ updated: readonly SettingEntryInput[] }>(`${STORAGE_SETTINGS_ENDPOINT}`, {
    method: 'POST',
    body: { entries },
  })
}
