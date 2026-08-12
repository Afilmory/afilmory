import type {
  BillingPlanOverrides,
  BillingPlanPricingConfigs,
  BillingPlanProductConfigs,
} from '@core/modules/platform/billing/plan/billing-plan.types'
import type {
  StoragePlanCatalog,
  StoragePlanPricingConfigs,
  StoragePlanProductConfigs,
} from '@core/modules/platform/billing/plan/storage-plan.types'
import type { UiSchema } from '@core/modules/ui/ui-schema/ui-schema.type'

import type { BuilderStorageProvider } from '../setting/storage-provider.utils'
import type {
  BillingPlanSettingField,
  SystemSettingDbField,
  SystemSettingField,
  SystemSettingKey,
} from './system-setting.constants'

export interface SystemSettings {
  allowRegistration: boolean
  maxRegistrableUsers: number | null
  maxPhotoUploadSizeMb: number | null
  maxDataSyncObjectSizeMb: number | null
  maxPhotoLibraryItems: number | null
  localProviderEnabled: boolean
  baseDomain: string
  oauthGatewayUrl: string | null
  oauthGoogleClientId: string | null
  oauthGoogleClientSecret: string | null
  oauthGithubClientId: string | null
  oauthGithubClientSecret: string | null
  oauthAppleWebClientId: string | null
  oauthAppleAppBundleId: string
  oauthAppleTeamId: string | null
  oauthAppleKeyId: string | null
  billingPlanOverrides: BillingPlanOverrides
  billingPlanProducts: BillingPlanProductConfigs
  billingPlanPricing: BillingPlanPricingConfigs
  storagePlanCatalog: StoragePlanCatalog
  storagePlanProducts: StoragePlanProductConfigs
  storagePlanPricing: StoragePlanPricingConfigs
  managedStorageProvider: string | null
  managedStorageProviders: BuilderStorageProvider[]
}

export type SystemSettingValueMap = {
  [K in SystemSettingDbField]: SystemSettings[K]
} & Partial<Record<BillingPlanSettingField, string | number | boolean | null>>

export interface SystemSettingStats {
  totalUsers: number
  registrationsRemaining: number | null
}

export interface SystemSettingOverview {
  schema: UiSchema<SystemSettingField>
  values: SystemSettingValueMap
  stats: SystemSettingStats
}

export type UpdateSystemSettingsInput = Partial<SystemSettings>
  & Partial<Record<BillingPlanSettingField, string | number | boolean | null | undefined>>

export { type SystemSettingField } from './system-setting.constants'

declare module '@tsuki-hono/event-emitter' {
  interface Events {
    'system.setting.updated': { key: SystemSettingKey, value: unknown }
  }
}
