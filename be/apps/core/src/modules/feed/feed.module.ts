import { Module } from '@afilmory/framework'

import { CacheModule } from '../cache/cache.module'
import { ManifestModule } from '../manifest/manifest.module'
import { SiteSettingModule } from '../site-setting/site-setting.module'
import { FeedController } from './feed.controller'
import { FeedService } from './feed.service'

@Module({
  imports: [CacheModule, SiteSettingModule, ManifestModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
