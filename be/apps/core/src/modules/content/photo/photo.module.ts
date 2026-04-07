import { Module } from '@tsuki/framework'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'
import { SystemSettingModule } from 'core/modules/configuration/system-setting/system-setting.module'
import { BillingModule } from 'core/modules/platform/billing/billing.module'
import { ManagedStorageModule } from 'core/modules/platform/managed-storage/managed-storage.module'

import { StorageAccessController } from './access/storage-access.controller'
import { StorageAccessService } from './access/storage-access.service'
import { PhotoController } from './assets/photo.controller'
import { PhotoAssetService } from './assets/photo-asset.service'
import { PhotoUploadParser } from './assets/photo-upload.parser'
import { PhotoUploadLimitInterceptor } from './assets/photo-upload-limit.interceptor'
import { PhotoBuilderService } from './builder/photo-builder.service'
import { PhotoStorageService } from './storage/photo-storage.service'

@Module({
  imports: [SystemSettingModule, BillingModule, ManagedStorageModule],
  controllers: [PhotoController, StorageAccessController],
  providers: [
    PhotoBuilderService,
    PhotoStorageService,
    PhotoAssetService,
    StorageAccessService,
    PhotoUploadLimitInterceptor,
    PhotoUploadParser,
    BuilderConfigService,
  ],
})
export class PhotoModule {}
