import { TaskQueueModule } from '@afilmory/task-queue'
import { DatabaseModule } from '@core/database/database.module'
import { RedisModule } from '@core/redis/redis.module'
import { Module } from '@tsuki-hono/common'

import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { DataManagementModule } from '../data-management/data-management.module'
import { AccountDeletionController } from './account-deletion.controller'
import { AccountDeletionQueue } from './account-deletion.queue'
import { AccountDeletionExecutor } from './account-deletion-executor.service'
import { AccountDeletionImpactService } from './account-deletion-impact.service'
import { AccountDeletionRequestService } from './account-deletion-request.service'

@Module({
  imports: [DatabaseModule, RedisModule, TaskQueueModule, AuthModule, BillingModule, DataManagementModule],
  controllers: [AccountDeletionController],
  providers: [
    AccountDeletionExecutor,
    AccountDeletionImpactService,
    AccountDeletionQueue,
    AccountDeletionRequestService,
  ],
})
export class AccountDeletionModule {}
