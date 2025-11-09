import { createLogger } from '@afilmory/framework'
import { injectable } from 'tsyringe'

import { RedisAccessor } from '../../redis/redis.provider'

const log = createLogger('CacheService')

export interface CacheSetOptions {
  ttlSeconds?: number
}

export interface CacheRememberOptions<T> extends CacheSetOptions {
  skipCacheWhen?: (value: T) => boolean
}

@injectable()
export class CacheService {
  constructor(private readonly redisAccessor: RedisAccessor) {}

  async getString(key: string): Promise<string | null> {
    try {
      return await this.redisAccessor.get().get(key)
    } catch (error) {
      log.warn(`Failed to read cache key "${key}": ${String(error)}`)
      return null
    }
  }

  async setString(key: string, value: string, options?: CacheSetOptions): Promise<void> {
    try {
      const client = this.redisAccessor.get()
      if (options?.ttlSeconds && options.ttlSeconds > 0) {
        await client.set(key, value, 'EX', options.ttlSeconds)
      } else {
        await client.set(key, value)
      }
    } catch (error) {
      log.warn(`Failed to write cache key "${key}": ${String(error)}`)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redisAccessor.get().del(key)
    } catch (error) {
      log.warn(`Failed to delete cache key "${key}": ${String(error)}`)
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.getString(key)
    if (raw === null) {
      return null
    }

    try {
      return JSON.parse(raw) as T
    } catch (error) {
      log.warn(`Failed to parse cache payload for key "${key}": ${String(error)}`)
      return null
    }
  }

  async setJson<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    try {
      const payload = JSON.stringify(value)
      if (payload === undefined) {
        log.warn(`Cache payload for key "${key}" resolved to undefined, skipping write.`)
        return
      }
      await this.setString(key, payload, options)
    } catch (error) {
      log.warn(`Failed to serialize cache payload for key "${key}": ${String(error)}`)
    }
  }

  async rememberJson<T>(key: string, factory: () => Promise<T>, options?: CacheRememberOptions<T>): Promise<T> {
    const cached = await this.getJson<T>(key)
    if (cached !== null) {
      return cached
    }

    const value = await factory()

    if (options?.skipCacheWhen && options.skipCacheWhen(value)) {
      return value
    }

    await this.setJson(key, value, options)
    return value
  }
}
