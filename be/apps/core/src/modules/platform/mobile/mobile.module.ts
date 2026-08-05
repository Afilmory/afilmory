import { DatabaseModule } from '@core/database/database.module'
import { StorageSettingModule } from '@core/modules/configuration/storage-setting/storage-setting.module'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { PhotoModule } from '@core/modules/content/photo/photo.module'
import { BillingModule } from '@core/modules/platform/billing/billing.module'
import { Module } from '@tsuki-hono/common'

import { MobileOnboardingController } from './onboarding/mobile-onboarding.controller'
import { MobileOnboardingService } from './onboarding/mobile-onboarding.service'
import {
  MobileStorageHandoffCapabilityController,
  MobileStorageHandoffController,
  MobileStorageHandoffExchangeController,
} from './storage-handoff/mobile-storage-handoff.controller'
import { MobileStorageHandoffService } from './storage-handoff/mobile-storage-handoff.service'

@Module({
  imports: [BillingModule, DatabaseModule, PhotoModule, StorageSettingModule, SystemSettingModule],
  controllers: [
    MobileOnboardingController,
    MobileStorageHandoffController,
    MobileStorageHandoffExchangeController,
    MobileStorageHandoffCapabilityController,
  ],
  providers: [MobileOnboardingService, MobileStorageHandoffService],
})
export class MobileModule {}
