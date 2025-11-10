import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getBuilderSettingsUiSchema, updateBuilderSettings } from './api'
import type { BuilderSettingsPayload } from './types'

export const BUILDER_SETTINGS_QUERY_KEY = ['settings', 'builder'] as const

export function useBuilderSettingsUiSchemaQuery() {
  return useQuery({
    queryKey: BUILDER_SETTINGS_QUERY_KEY,
    queryFn: getBuilderSettingsUiSchema,
  })
}

export function useUpdateBuilderSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: BuilderSettingsPayload) => {
      await updateBuilderSettings(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDER_SETTINGS_QUERY_KEY })
    },
  })
}
