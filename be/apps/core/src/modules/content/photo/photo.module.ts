import { Module } from '@afilmory/framework'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'

import { PhotoController } from './assets/photo.controller'
import { PhotoAssetService } from './assets/photo-asset.service'
import { PhotoBuilderService } from './builder/photo-builder.service'
import { PhotoStorageService } from './storage/photo-storage.service'

@Module({
  controllers: [PhotoController],
  providers: [PhotoBuilderService, PhotoStorageService, PhotoAssetService, BuilderConfigService],
})
export class PhotoModule {}
