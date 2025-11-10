import { AsyncLocalStorage } from 'node:async_hooks'

import { dbSchema } from '@afilmory/db'
import { createLogger } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import { getTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { injectable } from 'tsyringe'

import { DatabaseConfig } from './database.config'
import type { DatabaseContextStore, DrizzleDb } from './tokens'

const dbContext = new AsyncLocalStorage<DatabaseContextStore>()
const logger = createLogger('DB')

export function runWithDbContext<T>(fn: () => Promise<T> | T) {
  return new Promise<T>((resolve, reject) => {
    dbContext.run({}, () => {
      Promise.resolve(fn()).then(resolve).catch(reject)
    })
  })
}

export function getOptionalDbContext(): DatabaseContextStore | undefined {
  return dbContext.getStore()
}

export async function applyTenantIsolationContext(options?: {
  tenantId?: string | null
  isSuperAdmin?: boolean
}): Promise<void> {
  const store = getOptionalDbContext()
  if (!store?.transaction) {
    return
  }

  const tenantContext = options?.tenantId
    ? { id: options.tenantId }
    : (() => {
        const context = getTenantContext()
        return context ? { id: context.tenant.id } : null
      })()

  const isSuperAdmin = options?.isSuperAdmin ?? false

  if (!tenantContext && !isSuperAdmin) {
    throw new BizException(ErrorCode.TENANT_NOT_FOUND)
  }

  const current = store.tenantIsolation
  const tenantId = tenantContext?.id ?? null

  if (current && current.tenantId === tenantId && current.isSuperAdmin === isSuperAdmin) {
    return
  }

  const { client } = store.transaction

  await client.query("SELECT set_config('afilmory.is_superadmin', $1, true)", [isSuperAdmin ? 'true' : 'false'])

  if (isSuperAdmin) {
    await client.query('RESET afilmory.tenant_id')
  } else if (tenantId) {
    await client.query("SELECT set_config('afilmory.tenant_id', $1, true)", [tenantId])
  }

  store.tenantIsolation = {
    tenantId,
    isSuperAdmin,
  }
}

@injectable()
export class PgPoolProvider {
  private pool?: Pool

  constructor(private readonly config: DatabaseConfig) {}

  getPool(): Pool {
    if (!this.pool) {
      const options = this.config.getOptions()
      this.pool = new Pool({
        connectionString: options.url,
        max: options.max,
        idleTimeoutMillis: options.idleTimeoutMillis,
        connectionTimeoutMillis: options.connectionTimeoutMillis,
      })
      this.pool.on('error', (error) => {
        logger.error(`Unexpected error on idle PostgreSQL client: ${String(error)}`)
      })
    }
    return this.pool
  }

  async warmup(): Promise<void> {
    const pool = this.getPool()
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      logger.info('Database connection established successfully')
    } finally {
      client.release()
    }
  }
}

@injectable()
export class DrizzleProvider {
  private db?: DrizzleDb

  constructor(private readonly poolProvider: PgPoolProvider) {}

  getDb(): DrizzleDb {
    if (!this.db) {
      this.db = drizzle(this.poolProvider.getPool(), { schema: dbSchema })
    }
    return this.db
  }
}

@injectable()
export class DbAccessor {
  constructor(
    private readonly provider: DrizzleProvider,
    private readonly poolProvider: PgPoolProvider,
  ) {}

  get(): DrizzleDb {
    const store = getOptionalDbContext()
    if (store?.transaction) {
      if (!store.db) {
        store.db = drizzle(store.transaction.client, { schema: dbSchema })
      }
      return store.db
    }
    return this.provider.getDb()
  }
}
