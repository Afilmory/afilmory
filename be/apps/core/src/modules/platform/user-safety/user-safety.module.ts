import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { UserSafetyController } from './user-safety.controller'
import { UserSafetyService } from './user-safety.service'

@Module({
  imports: [DatabaseModule],
  controllers: [UserSafetyController],
  providers: [UserSafetyService],
})
export class UserSafetyModule {}
