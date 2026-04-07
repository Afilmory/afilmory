import { Module } from '@tsuki/framework'
import { SiteSettingModule } from 'core/modules/configuration/site-setting/site-setting.module'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { ManifestModule } from 'core/modules/content/manifest/manifest.module'

import { StaticAssetController } from './static-asset.controller'
import { StaticAssetHostService } from './static-asset-host.service'
import { StaticDashboardController } from './static-dashboard.controller'
import { StaticDashboardService } from './static-dashboard.service'
import { StaticShareController } from './static-share.controller'
import { StaticShareService } from './static-share.service'
import { StaticWebController } from './static-web.controller'
import { StaticWebService } from './static-web.service'

@Module({
  imports: [SiteSettingModule, SystemSettingModule, ManifestModule],
  controllers: [StaticShareController, StaticWebController, StaticDashboardController, StaticAssetController],
  providers: [StaticAssetHostService, StaticWebService, StaticDashboardService, StaticShareService],
})
export class StaticWebModule {}
