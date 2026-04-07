import { Module } from '@tsuki/framework'

import { PhotoModule } from '../photo/photo.module'
import { ManifestPublicController } from './manifest.public.controller'
import { ManifestService } from './manifest.service'

@Module({
  imports: [PhotoModule],
  controllers: [ManifestPublicController],
  providers: [ManifestService],
})
export class ManifestModule {}
