import { Module } from '@afilmory/framework'

import { DatabaseModule } from '../../database/database.module'
import { SettingModule } from '../setting/setting.module'
import { PhotoController } from './photo.controller'
import { PhotoBuilderService, PhotoService } from './photo.service'

@Module({
  imports: [DatabaseModule, SettingModule],
  providers: [PhotoBuilderService, PhotoService],
  controllers: [PhotoController],
})
export class PhotoModule {}
