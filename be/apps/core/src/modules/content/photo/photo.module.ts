import { Module } from '@afilmory/framework'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { BillingModule } from 'core/modules/platform/billing/billing.module'
import { ManagedStorageModule } from 'core/modules/platform/managed-storage/managed-storage.module'

import { PhotoController } from './assets/photo.controller'
import { PhotoAssetService } from './assets/photo-asset.service'
import { PhotoBuilderService } from './builder/photo-builder.service'
import { PhotoStorageService } from './storage/photo-storage.service'

@Module({
  imports: [SystemSettingModule, BillingModule, ManagedStorageModule],
  controllers: [PhotoController],
  providers: [PhotoBuilderService, PhotoStorageService, PhotoAssetService, BuilderConfigService],
})
export class PhotoModule {}
