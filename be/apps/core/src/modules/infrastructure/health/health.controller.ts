import { Controller, Get } from '@afilmory/framework'
import { PgPoolProvider } from 'core/database/database.provider'
import { AllowPlaceholderTenant } from 'core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from 'core/decorators/skip-tenant.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import { RedisProvider } from 'core/redis/redis.provider'

@Controller('health')
@SkipTenantGuard()
@AllowPlaceholderTenant()
export class HealthController {
  constructor(
    private readonly poolProvider: PgPoolProvider,
    private readonly redisProvider: RedisProvider,
  ) {}

  @Get('/')
  @BypassResponseTransform()
  async checkHealth() {
    const databaseCheck = await this.checkDatabase()
    const redisCheck = await this.checkRedis()

    const allHealthy = databaseCheck.status === 'ok' && redisCheck.status === 'ok'
    const status: 'ok' | 'degraded' = allHealthy ? 'ok' : 'degraded'

    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: databaseCheck,
        redis: redisCheck,
      },
    }
  }

  private async checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string }> {
    try {
      const pool = this.poolProvider.getPool()
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        return { status: 'ok' }
      } finally {
        client.release()
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async checkRedis(): Promise<{ status: 'ok' | 'error'; message?: string }> {
    try {
      const client = this.redisProvider.getClient()
      await client.ping()
      return { status: 'ok' }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
