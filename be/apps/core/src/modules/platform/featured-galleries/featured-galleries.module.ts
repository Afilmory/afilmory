import { DatabaseModule } from '@core/database/database.module'
import { UserSafetyModule } from '@core/modules/platform/user-safety/user-safety.module'
import { Module } from '@tsuki-hono/common'

import { FeaturedGalleriesController } from './featured-galleries.controller'
import { FeaturedGalleriesService } from './featured-galleries.service'

@Module({
  imports: [DatabaseModule, UserSafetyModule],
  controllers: [FeaturedGalleriesController],
  providers: [FeaturedGalleriesService],
})
export class FeaturedGalleriesModule {}
