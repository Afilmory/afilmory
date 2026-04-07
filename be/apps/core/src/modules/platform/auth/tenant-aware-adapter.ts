import { HttpContext } from '@tsuki/framework'
import type { Adapter, Where } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { BizException, ErrorCode } from 'core/errors'

type DrizzleAdapterConfig = Parameters<typeof drizzleAdapter>[1]
type DrizzleDb = Parameters<typeof drizzleAdapter>[0]

type AdapterInstance = ReturnType<ReturnType<typeof drizzleAdapter>>

type FindOneParams = Parameters<Adapter['findOne']>[0]
type FindManyParams = Parameters<Adapter['findMany']>[0]

/**
 * Creates a tenant-aware wrapper around the drizzle adapter.
 *
 * This wrapper intercepts findOne and findMany operations for 'user' and 'account' models
 * and automatically injects tenantId filtering based on the current HTTP context.
 *
 * This enables true multi-tenancy where:
 * - Same email can exist in different tenants as different users
 * - Same social account (e.g., GitHub) can be linked to different users in different tenants
 */
export function tenantAwareDrizzleAdapter(
  db: DrizzleDb,
  config: DrizzleAdapterConfig,
  getTenantId: () => string | null | Promise<string | null>,
): ReturnType<typeof drizzleAdapter> {
  const baseAdapterFactory = drizzleAdapter(db, config)

  return (options) => {
    const baseAdapter = baseAdapterFactory(options)

    const wrapFindOne = (originalFindOne: AdapterInstance['findOne']) => {
      return async (params: FindOneParams) => {
        const enhancedParams = await injectTenantFilterForFindOne(params, getTenantId)

        return originalFindOne(enhancedParams)
      }
    }

    const wrapFindMany = (originalFindMany: AdapterInstance['findMany']) => {
      return async (params: FindManyParams) => {
        const enhancedParams = await injectTenantFilterForFindMany(params, getTenantId)
        return originalFindMany(enhancedParams)
      }
    }

    return {
      ...baseAdapter,
      findOne: wrapFindOne(baseAdapter.findOne),
      findMany: wrapFindMany(baseAdapter.findMany),
    } as AdapterInstance
  }
}

/**
 * Injects tenantId filter into the where clause for user and account models.
 * Only applies to models that need tenant isolation.
 */
async function injectTenantFilterForFindOne(
  params: FindOneParams,
  getTenantId: () => string | null | Promise<string | null>,
): Promise<FindOneParams> {
  const modelsRequiringTenantFilter = ['user', 'account', 'session']

  if (!modelsRequiringTenantFilter.includes(params.model)) {
    return params
  }

  const tenantId = await getTenantId()
  if (!tenantId) {
    // No tenant context - allow query to proceed without tenant filter
    // This handles edge cases like initial setup or cross-tenant admin operations
    throw new BizException(ErrorCode.TENANT_NOT_FOUND, {
      message: 'Tenant Id is required',
    })
  }

  const tenantFilter: Where = {
    field: 'tenantId',
    value: tenantId,
    connector: 'AND',
  }

  const existingWhere = params.where ?? []

  // Check if tenantId filter already exists
  const hasTenantFilter = existingWhere.some((clause) => clause.field === 'tenantId')

  if (hasTenantFilter) {
    return params
  }

  return {
    ...params,
    where: [...existingWhere, tenantFilter],
  }
}

async function injectTenantFilterForFindMany(
  params: FindManyParams,
  getTenantId: () => string | null | Promise<string | null>,
): Promise<FindManyParams> {
  const modelsRequiringTenantFilter = ['user', 'account', 'session']

  if (!modelsRequiringTenantFilter.includes(params.model)) {
    return params
  }

  const tenantId = await getTenantId()
  if (!tenantId) {
    return params
  }

  const tenantFilter: Where = {
    field: 'tenantId',
    value: tenantId,
    connector: 'AND',
  }

  const existingWhere = params.where ?? []
  const hasTenantFilter = existingWhere.some((clause) => clause.field === 'tenantId')

  if (hasTenantFilter) {
    return params
  }

  return {
    ...params,
    where: [...existingWhere, tenantFilter],
  }
}

/**
 * Default tenant ID resolver that reads from HttpContext.
 * Used when no custom resolver is provided.
 */
export function defaultTenantIdResolver(): string | null {
  try {
    const tenantContext = HttpContext.getValue('tenant') as { tenant?: { id?: string | null } } | undefined
    return tenantContext?.tenant?.id ?? null
  } catch {
    return null
  }
}
