import { coreApi } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type { ManagedStorageOverview } from './types'

const STORAGE_BILLING_ENDPOINT = '/billing/storage'

export async function getManagedStorageOverview(): Promise<ManagedStorageOverview> {
  return camelCaseKeys<ManagedStorageOverview>(
    await coreApi(STORAGE_BILLING_ENDPOINT, {
      method: 'GET',
    }),
  )
}

export async function updateManagedStoragePlan(planId: string | null): Promise<ManagedStorageOverview> {
  return camelCaseKeys<ManagedStorageOverview>(
    await coreApi(STORAGE_BILLING_ENDPOINT, {
      method: 'PATCH',
      body: { planId },
    }),
  )
}
