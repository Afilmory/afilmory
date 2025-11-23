export type BillingPlanId = 'free' | 'pro' | 'friend'

export interface BillingPlanQuota {
  monthlyAssetProcessLimit: number | null
  libraryItemLimit: number | null
  maxUploadSizeMb: number | null
  maxSyncObjectSizeMb: number | null
}

export interface BillingPlanDefinition {
  id: BillingPlanId
  name: string
  description: string
  includedStorageBytes?: number | null
  quotas: BillingPlanQuota
}

export type BillingPlanQuotaOverride = Partial<BillingPlanQuota>

export type BillingPlanOverrides = Record<BillingPlanId | string, BillingPlanQuotaOverride>

export interface BillingPlanPaymentInfo {
  creemProductId?: string | null
}

export type BillingPlanProductConfigs = Record<BillingPlanId | string, BillingPlanPaymentInfo | undefined>

export interface BillingPlanPricing {
  monthlyPrice: number | null
  currency: string | null
}

export type BillingPlanPricingConfigs = Record<BillingPlanId | string, BillingPlanPricing | undefined>
