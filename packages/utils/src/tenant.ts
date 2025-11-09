const RESERVED_SLUGS = ['admin', 'docs', 'support', 'status', 'api', 'assets', 'static', 'www'] as const

export const RESERVED_TENANT_SLUGS = RESERVED_SLUGS

export type ReservedTenantSlug = (typeof RESERVED_TENANT_SLUGS)[number]

export function isTenantSlugReserved(slug: string): boolean {
  const normalized = slug.trim().toLowerCase()
  return RESERVED_TENANT_SLUGS.includes(normalized as ReservedTenantSlug)
}

export const DEFAULT_BASE_DOMAIN = 'afilmory.art'
