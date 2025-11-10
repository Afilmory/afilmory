import { Module } from '@afilmory/framework'

import { ManifestService } from './manifest.service'

@Module({
  providers: [ManifestService],
})
export class ManifestModule {}
