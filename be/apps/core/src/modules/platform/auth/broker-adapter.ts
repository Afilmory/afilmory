import type { Adapter } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'

type DrizzleAdapterConfig = Parameters<typeof drizzleAdapter>[1]
type DrizzleDb = Parameters<typeof drizzleAdapter>[0]

type AdapterInstance = ReturnType<ReturnType<typeof drizzleAdapter>>

type FindOneParams = Parameters<Adapter['findOne']>[0]
type CreateParams = Parameters<Adapter['create']>[0]

/**
 * Adapter for the mobile login broker: authenticates a provider identity
 * WITHOUT a tenant context. Account lookups run globally — when the same
 * provider identity exists in several tenants, the most recently updated
 * account wins. User/account creation is blocked: sign-up stays a web-only,
 * tenant-scoped flow.
 */
export function brokerDrizzleAdapter(db: DrizzleDb, config: DrizzleAdapterConfig): ReturnType<typeof drizzleAdapter> {
  const baseAdapterFactory = drizzleAdapter(db, config)

  return (options) => {
    const baseAdapter = baseAdapterFactory(options)

    const findOne = async (params: FindOneParams) => {
      if (params.model !== 'account') {
        return await baseAdapter.findOne(params)
      }

      const rows = await baseAdapter.findMany({
        model: 'account',
        where: params.where,
        sortBy: { field: 'updatedAt', direction: 'desc' },
        limit: 1,
      })
      return (rows[0] ?? null) as Awaited<ReturnType<AdapterInstance['findOne']>>
    }

    const create = async (params: CreateParams) => {
      if (params.model === 'user' || params.model === 'account') {
        throw new APIError('UNAUTHORIZED', {
          message: 'No workspace is linked to this account. Create your gallery on the web first.',
        })
      }
      return await baseAdapter.create(params)
    }

    return {
      ...baseAdapter,
      findOne,
      create,
    } as AdapterInstance
  }
}
