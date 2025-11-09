import { Module } from '@afilmory/framework'

import { ManifestModule } from '../manifest/manifest.module'
import { SiteSettingModule } from '../site-setting/site-setting.module'
import { StaticDashboardService } from './static-dashboard.service'
import { StaticWebController } from './static-web.controller'
import { StaticWebService } from './static-web.service'

@Module({
  imports: [SiteSettingModule, ManifestModule],
  controllers: [StaticWebController],
  providers: [StaticWebService, StaticDashboardService],
})
export class StaticWebModule {}
