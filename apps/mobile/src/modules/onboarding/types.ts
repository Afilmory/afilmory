export type MobileOnboardingState
  = | 'owner_action_required'
    | 'purchase_pending'
    | 'ready'
    | 'storage_recovery'
    | 'storage_required'
    | 'workspace_required'

export interface MobileBillingOffer {
  applicationPlanId: string | null
  description: string | null
  externalProductId: string
  id: string
  name: string
  rank: number
  storageCapacityBytes: number | null
  storagePlanId: string | null
}

export interface MobileOnboardingReadiness {
  appStore: {
    configured: boolean
    offers: MobileBillingOffer[]
  }
  membership: { role: 'admin' | 'member' | 'owner' } | null
  permissions: {
    canConfigureByo: boolean
    canPurchase: boolean
  }
  state: MobileOnboardingState
  storage: {
    activeProvider: string | null
    hasByoStorage: boolean
    hasManagedStorage: boolean
    managedPlanId: string | null
    recoveryRequired: boolean
  }
  subscription: {
    cancelAtPeriodEnd: boolean
    periodEnd: string | null
    provider: 'app_store' | 'creem'
    status: string
  } | null
  workspace: {
    id: string
    name: string
    slug: string
  } | null
}

export interface AppStorePurchaseContext {
  appAccountToken: string
  environment: 'production' | 'sandbox'
  offer: MobileBillingOffer
  productId: string
}

export interface AppStoreTransactionAcknowledgement {
  duplicate: boolean
  originalTransactionId: string
  status: string
  tenantId: string
  transactionId: string
}
