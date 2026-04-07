import { Module } from '@tsuki/framework'

import { SystemSettingModule } from '../../configuration/system-setting/system-setting.module'
import { BillingModule } from '../billing/billing.module'
import { ManagedStorageModule } from '../managed-storage/managed-storage.module'
import { DataManagementController } from './data-management.controller'
import { DataManagementService } from './data-management.service'

@Module({
  imports: [BillingModule, SystemSettingModule, ManagedStorageModule],
  controllers: [DataManagementController],
  providers: [DataManagementService],
})
export class DataManagementModule {}
