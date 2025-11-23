import type { tenantDomains, tenants } from '@afilmory/db'

export type TenantRecord = typeof tenants.$inferSelect
export type TenantDomainRecord = typeof tenantDomains.$inferSelect

export interface TenantAggregate {
  tenant: TenantRecord
}

export interface TenantDomainAggregate extends TenantAggregate {
  domain: TenantDomainRecord
}

export interface TenantContext extends TenantAggregate {
  readonly isPlaceholder?: boolean
  readonly requestedSlug?: string | null
}

export interface TenantResolutionInput {
  tenantId?: string | null
  slug?: string | null
}
