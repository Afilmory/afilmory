import type { BillingProvider } from '../billing-domain.types'
import type { QuotaDimension } from '../quota/billing-quota.policy'

export interface BillingOverview {
  applicationPlan: { id: string, name: string }
  storagePlan: { id: string, name: string, capacityBytes: number | null } | null
  managedStorageEnabled: boolean
  subscriptionProvider: BillingProvider | null
  dimensions: QuotaDimension[]
}
