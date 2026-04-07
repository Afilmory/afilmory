import { Module } from '@tsuki/framework'
import { DatabaseModule } from 'core/database/database.module'

import { FeaturedGalleriesController } from './featured-galleries.controller'
import { FeaturedGalleriesService } from './featured-galleries.service'

@Module({
  imports: [DatabaseModule],
  controllers: [FeaturedGalleriesController],
  providers: [FeaturedGalleriesService],
})
export class FeaturedGalleriesModule {}
