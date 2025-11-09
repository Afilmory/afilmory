import type { tenants, tenantStatusEnum } from '@afilmory/db'

export type TenantRecord = typeof tenants.$inferSelect
export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number]

export interface TenantAggregate {
  tenant: TenantRecord
}

export type TenantContext = TenantAggregate

export interface TenantResolutionInput {
  tenantId?: string | null
  slug?: string | null
}

export interface TenantCacheEntry {
  aggregate: TenantAggregate
  cachedAt: number
}
