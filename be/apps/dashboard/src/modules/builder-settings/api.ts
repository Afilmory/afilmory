import { coreApi } from '~/lib/api-client'

import type { BuilderSettingsPayload,BuilderSettingUiSchemaResponse } from './types'

const BUILDER_SETTINGS_ENDPOINT = '/builder/settings'

export async function getBuilderSettingsUiSchema() {
  return await coreApi<BuilderSettingUiSchemaResponse>(`${BUILDER_SETTINGS_ENDPOINT}/ui-schema`)
}

export async function updateBuilderSettings(payload: BuilderSettingsPayload) {
  return await coreApi<{ updated: boolean }>(`${BUILDER_SETTINGS_ENDPOINT}`, {
    method: 'POST',
    body: payload,
  })
}
