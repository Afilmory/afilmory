import { Module } from '@afilmory/framework'
import { SiteSettingModule } from 'core/modules/configuration/site-setting/site-setting.module'

import { ManifestModule } from '../manifest/manifest.module'
import { OgController } from './og.controller'
import { OgService } from './og.service'

@Module({
  imports: [ManifestModule, SiteSettingModule],
  controllers: [OgController],
  providers: [OgService],
})
export class OgModule {}
