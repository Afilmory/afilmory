import { Module } from '@afilmory/framework'
import { DatabaseModule } from 'core/database/database.module'

import { SettingController } from './setting.controller'
import { SettingService } from './setting.service'

@Module({
  imports: [DatabaseModule],
  providers: [SettingService],
  controllers: [SettingController],
  exports: [SettingService],
})
export class SettingModule {}
