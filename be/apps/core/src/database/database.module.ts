import { Module } from '@afilmory/framework'
import { injectable } from 'tsyringe'

import { DatabaseConfig } from './database.config'
import { DbAccessor, DrizzleProvider, PgPoolProvider } from './database.provider'

@injectable()
class PgPoolTokenProvider {
  constructor(private readonly poolProvider: PgPoolProvider) {}
  get() {
    return this.poolProvider.getPool()
  }
}

@injectable()
class DrizzleTokenProvider {
  constructor(private readonly drizzleProvider: DrizzleProvider) {}
  get() {
    return this.drizzleProvider.getDb()
  }
}

@Module({
  providers: [DatabaseConfig, PgPoolProvider, DrizzleProvider, DbAccessor, PgPoolTokenProvider, DrizzleTokenProvider],
})
export class DatabaseModule {}
