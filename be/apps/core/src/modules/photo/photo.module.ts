import { Module } from '@afilmory/framework'

import { PhotoController } from './photo.controller'
import { PhotoBuilderService } from './photo.service'
import { PhotoAssetService } from './photo-asset.service'
import { PhotoStorageService } from './photo-storage.service'

@Module({
  controllers: [PhotoController],
  providers: [PhotoBuilderService, PhotoStorageService, PhotoAssetService],
})
export class PhotoModule {}
