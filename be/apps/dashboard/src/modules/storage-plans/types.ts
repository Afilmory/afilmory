export interface ManagedStoragePricing {
  monthlyPrice: number | null
  currency: string | null
}

export interface ManagedStoragePaymentInfo {
  creemProductId?: string | null
}

export interface ManagedStoragePlanSummary {
  id: string
  name: string
  description?: string | null
  capacityBytes: number | null
  pricing?: ManagedStoragePricing
  payment?: ManagedStoragePaymentInfo
}

export interface ManagedStorageOverview {
  managedStorageEnabled: boolean
  managedProviderKey: string | null
  currentPlanId: string | null
  currentPlan: ManagedStoragePlanSummary | null
  availablePlans: ManagedStoragePlanSummary[]
}
