export type BillingProvider = 'app_store' | 'creem'

export type BillingSubscriptionStatus
  = | 'active'
    | 'billing_retry'
    | 'cancel_scheduled'
    | 'conflict'
    | 'expired'
    | 'grace_period'
    | 'pending'
    | 'revoked'

export type BillingEntitlementKind = 'application_plan' | 'managed_storage'

export interface BillingOfferGrant {
  applicationPlanId: string | null
  storagePlanId: string | null
}

export interface BillingSubscriptionReconciliationInput extends BillingOfferGrant {
  appAccountToken?: string | null
  billingOwnerUserId?: string | null
  environment: string
  externalSubscriptionId: string
  metadata?: Record<string, unknown> | null
  offerId: string
  originalTransactionId?: string | null
  periodEnd?: string | null
  periodStart?: string | null
  provider: BillingProvider
  providerUpdatedAt?: string | null
  rank: number
  status: BillingSubscriptionStatus
  tenantId: string
}

export interface BillingProjection {
  applicationPlanId: string
  storagePlanId: string | null
}
