import type { BillingPlanDefinition, BillingPlanId } from './billing-plan.types'

export const BILLING_PLAN_IDS: readonly BillingPlanId[] = ['free', 'pro', 'friend']

export const BILLING_PLAN_DEFINITIONS: Record<BillingPlanId, BillingPlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    description: '使用 Afilmory 子域名创建并发布个人图库。',
    includedStorageBytes: 0,
    quotas: {
      customDomainLimit: 0,
      monthlyAssetProcessLimit: 300,
      libraryItemLimit: 500,
      maxUploadSizeMb: 20,
      maxSyncObjectSizeMb: 50,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: '面向需要更大图库、品牌域名与托管 HTTPS 的创作者。',
    includedStorageBytes: 0,
    quotas: {
      customDomainLimit: 1,
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
      customDomainLimit: null,
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
