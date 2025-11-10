import { Module } from '@afilmory/framework'

import { SettingModule } from '../setting/setting.module'
import { SiteSettingController } from './site-setting.controller'
import { SiteSettingPublicController } from './site-setting.public.controller'
import { SiteSettingService } from './site-setting.service'

@Module({
  imports: [SettingModule],
  controllers: [SiteSettingController, SiteSettingPublicController],
  providers: [SiteSettingService],
})
export class SiteSettingModule {}
