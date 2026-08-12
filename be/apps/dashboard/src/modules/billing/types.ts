export interface BillingPlanQuota {
  customDomainLimit: number | null
  monthlyAssetProcessLimit: number | null
  libraryItemLimit: number | null
  maxUploadSizeMb: number | null
  maxSyncObjectSizeMb: number | null
}

export interface BillingPlanSummary {
  planId: string
  name: string
  description: string
  quotas: BillingPlanQuota
  pricing?: {
    monthlyPrice: number | null
    currency: string | null
  }
  payment?: {
    appStoreProductId?: string | null
    creemProductId?: string | null
  }
}

export interface BillingPlanResponse {
  plan: BillingPlanSummary
  availablePlans: BillingPlanSummary[]
}
