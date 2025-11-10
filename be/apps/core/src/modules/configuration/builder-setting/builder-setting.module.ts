import { Module } from '@afilmory/framework'

import { SettingModule } from '../setting/setting.module'
import { BuilderSettingController } from './builder-setting.controller'
import { BuilderSettingService } from './builder-setting.service'

@Module({
  imports: [SettingModule],
  controllers: [BuilderSettingController],
  providers: [BuilderSettingService],
})
export class BuilderSettingModule {}
