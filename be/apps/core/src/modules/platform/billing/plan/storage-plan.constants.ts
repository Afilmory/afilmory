import type { StoragePlanCatalog } from './storage-plan.types'

export const STORAGE_PLAN_CATALOG_SETTING_KEY = 'system.storage.planCatalog'
export const STORAGE_PLAN_PRODUCTS_SETTING_KEY = 'system.storage.planProducts'
export const STORAGE_PLAN_PRICING_SETTING_KEY = 'system.storage.planPricing'

export const DEFAULT_MANAGED_STORAGE_PLAN_ID = 'managed-1gb'

export const DEFAULT_STORAGE_PLAN_CATALOG: StoragePlanCatalog = {
  [DEFAULT_MANAGED_STORAGE_PLAN_ID]: {
    name: 'Managed Storage • 1GB',
    description: '新用户默认包含的免费托管存储空间。',
    capacityBytes: 1 * 1024 * 1024 * 1024,
    isActive: true,
  },
  'managed-5gb': {
    name: 'Managed B2 • 5GB',
    description: '适用于入门用户的托管存储方案。',
    capacityBytes: 5 * 1024 * 1024 * 1024,
    isActive: true,
  },
  'managed-50gb': {
    name: 'Managed B2 • 50GB',
    description: '适用于成长阶段的托管存储方案。',
    capacityBytes: 50 * 1024 * 1024 * 1024,
    isActive: true,
  },
}
