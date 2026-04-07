import path from 'node:path'

import { createLogger } from '@tsuki/framework'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { DatabaseConfig } from '../database/database.config'

const logger = createLogger('CLI:DB_MIGRATE')

export interface MigrationCliOptions {
  readonly command: 'db:migrate'
}

export function parseMigrationCliArgs(argv: readonly string[]): MigrationCliOptions | null {
  if (argv.length === 0) {
    return null
  }

  if (argv[0] !== 'db:migrate') {
    return null
  }

  return { command: 'db:migrate' }
}

export async function handleMigrationCli(_: MigrationCliOptions): Promise<void> {
  const databaseConfig = new DatabaseConfig()
  const options = databaseConfig.getOptions()

  const pool = new Pool({
    connectionString: options.url,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
  })

  try {
    const db = drizzle(pool)

    logger.info('Applying database migrations...')
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), 'migrations'),
    })
    logger.info('Database migrations applied successfully')
  } finally {
    await pool.end()
  }
}
