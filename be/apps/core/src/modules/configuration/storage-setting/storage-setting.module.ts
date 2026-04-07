import { Module } from '@tsuki/framework'
import { BillingModule } from 'core/modules/platform/billing/billing.module'

import { SettingModule } from '../setting/setting.module'
import { StorageSettingController } from './storage-setting.controller'
import { StorageSettingService } from './storage-setting.service'

@Module({
  imports: [SettingModule, BillingModule],
  controllers: [StorageSettingController],
  providers: [StorageSettingService],
})
export class StorageSettingModule {}
