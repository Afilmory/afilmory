import { Module } from '@afilmory/framework'

import { RedisModule } from '../../redis/redis.module'
import { CacheService } from './cache.service'

@Module({
  imports: [RedisModule],
  providers: [CacheService],
})
export class CacheModule {}
