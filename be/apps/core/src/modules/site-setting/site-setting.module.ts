import { Module } from '@afilmory/framework'

import { SettingModule } from '../setting/setting.module'
import { SiteSettingController } from './site-setting.controller'
import { SiteSettingService } from './site-setting.service'

@Module({
  imports: [SettingModule],
  controllers: [SiteSettingController],
  providers: [SiteSettingService],
  exports: [SiteSettingService],
})
export class SiteSettingModule {}
