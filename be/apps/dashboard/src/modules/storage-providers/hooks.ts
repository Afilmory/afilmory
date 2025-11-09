import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSettings, updateSettings } from '~/modules/settings'

import { STORAGE_SETTING_KEYS } from './constants'
import type { StorageProvider, StorageProvidersPayload } from './types'
import {
  ensureActiveProviderId,
  normalizeStorageProviderConfig,
  parseStorageProviders,
  serializeStorageProviders,
} from './utils'

export const STORAGE_PROVIDERS_QUERY_KEY = ['settings', 'storage-providers'] as const

export function useStorageProvidersQuery() {
  return useQuery({
    queryKey: STORAGE_PROVIDERS_QUERY_KEY,
    queryFn: async () => {
      const response = await getSettings([STORAGE_SETTING_KEYS.providers, STORAGE_SETTING_KEYS.activeProvider])

      const rawProviders = response.values[STORAGE_SETTING_KEYS.providers] ?? '[]'
      const providers = parseStorageProviders(rawProviders).map((provider) => normalizeStorageProviderConfig(provider))
      const activeProviderRaw = response.values[STORAGE_SETTING_KEYS.activeProvider] ?? ''
      const activeProviderId =
        typeof activeProviderRaw === 'string' && activeProviderRaw.trim().length > 0 ? activeProviderRaw.trim() : null

      return {
        providers,
        activeProviderId: ensureActiveProviderId(providers, activeProviderId),
      }
    },
  })
}

export function useUpdateStorageProvidersMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: StorageProvidersPayload) => {
      const currentProviders = payload.providers.map((provider) => normalizeStorageProviderConfig(provider))
      const previousProviders = queryClient.getQueryData<{
        providers: StorageProvider[]
        activeProviderId: string | null
      }>(STORAGE_PROVIDERS_QUERY_KEY)?.providers

      const resolvedProviders = restoreProviderSecrets(currentProviders, previousProviders ?? [])

      await updateSettings([
        {
          key: STORAGE_SETTING_KEYS.providers,
          value: serializeStorageProviders(resolvedProviders),
        },
        {
          key: STORAGE_SETTING_KEYS.activeProvider,
          value: payload.activeProviderId ?? '',
        },
      ])
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: STORAGE_PROVIDERS_QUERY_KEY,
      })
    },
  })
}

function restoreProviderSecrets(
  nextProviders: StorageProvider[],
  previousProviders: StorageProvider[],
): StorageProvider[] {
  const previousMap = new Map(previousProviders.map((provider) => [provider.id, provider]))

  return nextProviders.map((provider) => {
    const previous = previousMap.get(provider.id)
    const config: Record<string, string> = { ...provider.config }

    for (const [key, value] of Object.entries(config)) {
      if (value.trim().length === 0 && previous) {
        config[key] = previous.config[key] ?? ''
      }
    }

    return { ...provider, config }
  })
}
