import type { CallHandler, ExecutionContext, FrameworkResponse, Interceptor } from '@afilmory/framework'
import { createLogger } from '@afilmory/framework'
import { getTenantContext } from 'core/modules/tenant/tenant.context'
import type { PoolClient } from 'pg'
import { injectable } from 'tsyringe'

import {
  applyTenantIsolationContext,
  getOptionalDbContext,
  PgPoolProvider,
  runWithDbContext,
} from './database.provider'

const logger = createLogger('DB')

@injectable()
export class TransactionInterceptor implements Interceptor {
  constructor(private readonly poolProvider: PgPoolProvider) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    // Ensure db context exists per request lifecycle
    return await runWithDbContext(async () => {
      const client: PoolClient = await this.poolProvider.getPool().connect()
      const store = getOptionalDbContext()!
      store.transaction = { client }
      try {
        await client.query('BEGIN')

        const tenant = getTenantContext()
        if (tenant) {
          await applyTenantIsolationContext({ tenantId: tenant.tenant.id, isSuperAdmin: false })
        }

        const result = await next.handle()
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          logger.error(`Transaction rollback failed: ${String(rollbackError)}`)
        }
        throw error
      } finally {
        store.transaction = undefined
        client.release()
      }
    })
  }
}
