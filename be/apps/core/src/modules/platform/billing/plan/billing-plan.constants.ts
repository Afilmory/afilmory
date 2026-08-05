import type { BillingPlanDefinition, BillingPlanId } from './billing-plan.types'

export const BILLING_PLAN_IDS: readonly BillingPlanId[] = ['free', 'pro', 'friend']

export const BILLING_PLAN_DEFINITIONS: Record<BillingPlanId, BillingPlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: '默认入门方案，适用于个人与试用场景。',
    includedStorageBytes: 0,
    quotas: {
      monthlyAssetProcessLimit: 300,
      libraryItemLimit: 500,
      maxUploadSizeMb: 20,
      maxSyncObjectSizeMb: 50,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: '专业方案',
    includedStorageBytes: 0,
    quotas: {
      monthlyAssetProcessLimit: 1000,
      libraryItemLimit: 5000,
      maxUploadSizeMb: 200,
      maxSyncObjectSizeMb: 500,
    },
  },
  friend: {
    id: 'friend',
    name: 'Friend',
    description: '内部使用的好友方案，没有任何限制，仅超级管理员可设置。',
    includedStorageBytes: null,
    quotas: {
      monthlyAssetProcessLimit: null,
      libraryItemLimit: null,
      maxUploadSizeMb: null,
      maxSyncObjectSizeMb: null,
    },
  },
}

export const BILLING_PLAN_OVERRIDES_SETTING_KEY = 'system.billing.planOverrides'
export const BILLING_PLAN_PRODUCTS_SETTING_KEY = 'system.billing.planProducts'
export const BILLING_PLAN_PRICING_SETTING_KEY = 'system.billing.planPricing'
