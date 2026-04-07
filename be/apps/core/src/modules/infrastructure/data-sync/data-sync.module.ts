import { Module } from '@tsuki/framework'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { BillingModule } from 'core/modules/platform/billing/billing.module'

import { DataSyncController } from './data-sync.controller'
import { DataSyncService } from './data-sync.service'

@Module({
  imports: [SystemSettingModule, BillingModule],
  controllers: [DataSyncController],
  providers: [DataSyncService, BuilderConfigService],
})
export class DataSyncModule {}
