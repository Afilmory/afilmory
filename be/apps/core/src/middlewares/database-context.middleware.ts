import type { HttpMiddleware } from '@afilmory/framework'
import { Middleware } from '@afilmory/framework'
import {
  applyTenantIsolationContext,
  getOptionalDbContext,
  PgPoolProvider,
  runWithDbContext,
} from 'core/database/database.provider'
import { getTenantContext } from 'core/modules/platform/tenant/tenant.context'
import type { Context, Next } from 'hono'
import { injectable } from 'tsyringe'

import { logger } from '../helpers/logger.helper'

@Middleware()
@injectable()
export class DatabaseContextMiddleware implements HttpMiddleware {
  private readonly log = logger.extend('DatabaseContext')

  constructor(private readonly poolProvider: PgPoolProvider) {}

  async use(_context: Context, next: Next): Promise<Response | void> {
    return await runWithDbContext(async () => {
      const client = await this.poolProvider.getPool().connect()
      const store = getOptionalDbContext()!
      store.transaction = { client }
      try {
        await client.query('BEGIN')

        const tenant = getTenantContext()
        if (tenant) {
          await applyTenantIsolationContext({ tenantId: tenant.tenant.id, isSuperAdmin: false })
        }

        const response = await next()
        await client.query('COMMIT')
        return response
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          this.log.error(`Transaction rollback failed: ${String(rollbackError)}`)
        }
        throw error
      } finally {
        store.transaction = undefined
        client.release()
      }
    })
  }
}
