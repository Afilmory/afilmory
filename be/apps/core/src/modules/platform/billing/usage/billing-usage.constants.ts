export const BILLING_USAGE_EVENT = {
  PHOTO_ASSET_CREATED: 'photo.asset.created',
  PHOTO_ASSET_DELETED: 'photo.asset.deleted',
  DATA_SYNC_COMPLETED: 'data.sync.completed',
} as const

export type BillingUsageEventType = (typeof BILLING_USAGE_EVENT)[keyof typeof BILLING_USAGE_EVENT]

export const BILLING_USAGE_UNIT = {
  COUNT: 'count',
  BYTE: 'byte',
} as const

export type BillingUsageUnit = (typeof BILLING_USAGE_UNIT)[keyof typeof BILLING_USAGE_UNIT]

export const DEFAULT_BILLING_USAGE_UNIT: BillingUsageUnit = BILLING_USAGE_UNIT.COUNT
