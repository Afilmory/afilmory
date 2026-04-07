import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'

import { SettingModule } from '../setting/setting.module'
import { SiteSettingController } from './site-setting.controller'
import { SiteSettingPublicController } from './site-setting.public.controller'
import { SiteSettingService } from './site-setting.service'

@Module({
  imports: [SettingModule, DatabaseModule],
  controllers: [SiteSettingController, SiteSettingPublicController],
  providers: [SiteSettingService],
})
export class SiteSettingModule {}
