import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSiteSettingUiSchema, updateSiteSettings } from './api'
import type { SiteSettingEntryInput } from './types'

export const SITE_SETTING_UI_SCHEMA_QUERY_KEY = ['site-settings', 'ui-schema'] as const

export function useSiteSettingUiSchemaQuery() {
  return useQuery({
    queryKey: SITE_SETTING_UI_SCHEMA_QUERY_KEY,
    queryFn: getSiteSettingUiSchema,
  })
}

export function useUpdateSiteSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entries: readonly SiteSettingEntryInput[]) => {
      await updateSiteSettings(entries)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: SITE_SETTING_UI_SCHEMA_QUERY_KEY,
      })
    },
  })
}
