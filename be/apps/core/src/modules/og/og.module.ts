import { Module } from '@afilmory/framework'

import { ManifestModule } from '../manifest/manifest.module'
import { SiteSettingModule } from '../site-setting/site-setting.module'
import { OgController } from './og.controller'
import { OgService } from './og.service'

@Module({
  imports: [ManifestModule, SiteSettingModule],
  controllers: [OgController],
  providers: [OgService],
})
export class OgModule {}
