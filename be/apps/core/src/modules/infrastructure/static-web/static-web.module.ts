import { Module } from '@afilmory/framework'
import { SiteSettingModule } from 'core/modules/configuration/site-setting/site-setting.module'
import { ManifestModule } from 'core/modules/content/manifest/manifest.module'

import { StaticDashboardService } from './static-dashboard.service'
import { StaticWebController } from './static-web.controller'
import { StaticWebService } from './static-web.service'

@Module({
  imports: [SiteSettingModule, ManifestModule],
  controllers: [StaticWebController],
  providers: [StaticWebService, StaticDashboardService],
})
export class StaticWebModule {}
