import { Module } from '@afilmory/framework'

import { SettingModule } from '../setting/setting.module'
import { StorageSettingController } from './storage-setting.controller'
import { StorageSettingService } from './storage-setting.service'

@Module({
  imports: [SettingModule],
  controllers: [StorageSettingController],
  providers: [StorageSettingService],
})
export class StorageSettingModule {}
