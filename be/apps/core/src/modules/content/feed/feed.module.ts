import { Module } from '@afilmory/framework'
import { SiteSettingModule } from 'core/modules/configuration/site-setting/site-setting.module'
import { CacheModule } from 'core/modules/infrastructure/cache/cache.module'

import { ManifestModule } from '../manifest/manifest.module'
import { FeedController } from './feed.controller'
import { FeedService } from './feed.service'

@Module({
  imports: [CacheModule, SiteSettingModule, ManifestModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
