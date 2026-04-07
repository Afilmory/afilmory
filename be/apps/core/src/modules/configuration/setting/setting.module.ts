import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'

import { SettingController } from './setting.controller'
import { SettingService } from './setting.service'

@Module({
  imports: [DatabaseModule],
  providers: [SettingService],
  controllers: [SettingController],
})
export class SettingModule {}
