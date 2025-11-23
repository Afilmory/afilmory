export interface StoragePlanDefinition {
  id: string
  name: string
  description?: string | null
  capacityBytes: number | null
  isActive?: boolean
}

export type StoragePlanCatalog = Record<string, Omit<StoragePlanDefinition, 'id'>>

export interface StoragePlanPricing {
  monthlyPrice: number | null
  currency: string | null
}

export interface StoragePlanPaymentInfo {
  creemProductId?: string | null
}

export type StoragePlanPricingConfigs = Record<string, StoragePlanPricing | undefined>
export type StoragePlanProductConfigs = Record<string, StoragePlanPaymentInfo | undefined>

export interface StoragePlanSummary extends StoragePlanDefinition {
  pricing?: StoragePlanPricing
  payment?: StoragePlanPaymentInfo
}

export interface StoragePlanOverview {
  managedStorageEnabled: boolean
  managedProviderKey: string | null
  currentPlanId: string | null
  currentPlan: StoragePlanSummary | null
  availablePlans: StoragePlanSummary[]
}
