export interface BillingPurchaseOffer {
  applicationPlanId: string | null
  description: string | null
  externalProductId: string
  id: string
  name: string
  rank: number
  storageCapacityBytes: number | null
  storagePlanId: string | null
}
