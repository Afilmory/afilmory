import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { RedisModule } from 'core/redis/redis.module'

import { HealthController } from './health.controller'

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
