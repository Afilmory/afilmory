import { $fetch } from 'ofetch'

import { camelCaseKeys } from '~/lib/case'
import type { StorageProvider, StorageProviderFormSchema } from '~/modules/storage-providers/types'

const handoffApi = $fetch.create({ baseURL: '/api', credentials: 'include' })

export interface StorageHandoffContext {
  capabilityExpiresAt: string
  providerForm: StorageProviderFormSchema
  returnUrl: string
  values: {
    builderStorageActiveProvider?: string | null
    builderStorageProviders?: string | null
    photoStorageSecureAccess?: string | null
  }
  workspace: { name: string, slug: string } | null
}

export async function exchangeStorageHandoff(code: string): Promise<void> {
  await handoffApi('/mobile/storage-handoffs/exchange', { body: { code }, method: 'POST' })
}

export async function getStorageHandoffContext(): Promise<StorageHandoffContext> {
  return camelCaseKeys(await handoffApi('/mobile/storage-handoff-capability'))
}

export async function testStorageHandoffProvider(provider: StorageProvider): Promise<void> {
  await handoffApi('/mobile/storage-handoff-capability/test', { body: { provider }, method: 'POST' })
}

export async function saveStorageHandoff(input: {
  activeProviderId: string
  providers: StorageProvider[]
  secureAccessEnabled: boolean
}): Promise<{ completed: true, returnUrl: string }> {
  return camelCaseKeys(
    await handoffApi('/mobile/storage-handoff-capability/save', {
      body: {
        entries: [
          { key: 'builder.storage.providers', value: JSON.stringify(input.providers) },
          { key: 'builder.storage.activeProvider', value: input.activeProviderId },
          { key: 'photo.storage.secureAccess', value: input.secureAccessEnabled ? 'true' : 'false' },
        ],
      },
      method: 'POST',
    }),
  )
}
