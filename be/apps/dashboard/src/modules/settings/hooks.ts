import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSettingUiSchema, updateSettings } from './api'
import type { SettingEntryInput } from './types'

export const SETTING_UI_SCHEMA_QUERY_KEY = ['settings', 'ui-schema'] as const

export function useSettingUiSchemaQuery() {
  return useQuery({
    queryKey: SETTING_UI_SCHEMA_QUERY_KEY,
    queryFn: getSettingUiSchema,
  })
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entries: readonly SettingEntryInput[]) => {
      await updateSettings(entries)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: SETTING_UI_SCHEMA_QUERY_KEY,
      })
    },
  })
}
