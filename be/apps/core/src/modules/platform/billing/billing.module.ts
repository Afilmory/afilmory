import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'

import { BillingController } from './billing.controller'
import { BillingPlanService } from './billing-plan.service'
import { BillingUsageService } from './billing-usage.service'
import { StoragePlanService } from './storage-plan.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule],
  controllers: [BillingController],
  providers: [BillingUsageService, BillingPlanService, StoragePlanService],
})
export class BillingModule {}
