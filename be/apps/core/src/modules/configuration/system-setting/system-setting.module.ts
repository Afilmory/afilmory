import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { SystemSettingService } from './system-setting.service'
import { SystemSettingStore } from './system-setting.store.service'

@Module({
  imports: [DatabaseModule],
  providers: [SystemSettingStore, SystemSettingService],
})
export class SystemSettingModule {}
