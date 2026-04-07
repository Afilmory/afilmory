import { createLogger } from '@tsuki/framework'
import type { RedisClient } from '@afilmory/redis'
import { createRedisClient } from '@afilmory/redis'
import { injectable } from 'tsyringe'

import { RedisConfig } from './redis.config'

const logger = createLogger('Redis')

@injectable()
export class RedisProvider {
  private client?: RedisClient

  constructor(private readonly config: RedisConfig) {}

  getClient(): RedisClient {
    if (!this.client) {
      const options = this.config.getOptions()
      const client = createRedisClient(options.url)
      client.on('error', (error) => {
        logger.error(`Redis error: ${String(error)}`)
      })
      client.on('connect', () => {
        logger.info('Redis connecting...')
      })
      client.on('ready', () => {
        logger.info('Redis connection established successfully')
      })
      client.on('end', () => {
        logger.warn('Redis connection closed')
      })
      this.client = client
    }
    return this.client
  }

  async warmup(): Promise<void> {
    const client = this.getClient()
    await client.ping()
  }
}

@injectable()
export class RedisAccessor {
  constructor(private readonly provider: RedisProvider) {}

  get(): RedisClient {
    return this.provider.getClient()
  }
}
