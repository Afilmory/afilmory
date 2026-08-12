import type { BuilderStorageProvider } from '@core/modules/configuration/setting/storage-provider.utils'
import { DEFAULT_MANAGED_STORAGE_PLAN_ID } from '@core/modules/platform/billing/plan/storage-plan.constants'

export interface RegistrationStorageDefaults {
  activeProvider: 'managed'
  storagePlanId: typeof DEFAULT_MANAGED_STORAGE_PLAN_ID
}

export function resolveRegistrationStorageDefaults(
  managedProvider: BuilderStorageProvider | null,
): RegistrationStorageDefaults | null {
  if (!managedProvider) {
    return null
  }

  return {
    activeProvider: 'managed',
    storagePlanId: DEFAULT_MANAGED_STORAGE_PLAN_ID,
  }
}
