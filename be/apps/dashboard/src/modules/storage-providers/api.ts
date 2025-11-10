import { coreApi } from '~/lib/api-client'

import type { StorageSettingEntry } from './types'

const STORAGE_SETTINGS_ENDPOINT = '/storage/settings'

export async function getStorageSettings(keys: readonly string[]) {
  return await coreApi<{
    keys: string[]
    values: Record<string, string | null>
  }>(`${STORAGE_SETTINGS_ENDPOINT}/batch`, {
    method: 'POST',
    body: { keys },
  })
}

export async function updateStorageSettings(entries: readonly StorageSettingEntry[]) {
  return await coreApi<{ updated: readonly StorageSettingEntry[] }>(`${STORAGE_SETTINGS_ENDPOINT}`, {
    method: 'POST',
    body: { entries },
  })
}
