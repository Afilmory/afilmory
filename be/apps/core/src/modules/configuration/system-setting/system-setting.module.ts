import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'

import { SystemSettingService } from './system-setting.service'
import { SystemSettingStore } from './system-setting.store.service'

@Module({
  imports: [DatabaseModule],
  providers: [SystemSettingStore, SystemSettingService],
  exports: [SystemSettingService],
})
export class SystemSettingModule {}
