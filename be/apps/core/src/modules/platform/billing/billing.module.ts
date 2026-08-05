import { DatabaseModule } from '@core/database/database.module'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { Module } from '@tsuki-hono/common'

import { AppStoreBillingController, AppStoreNotificationController } from './app-store-billing.controller'
import { AppStoreBillingService } from './app-store-billing.service'
import { AppStoreSignedDataService } from './app-store-signed-data.service'
import { BillingController } from './billing.controller'
import { BillingCatalogService } from './billing-catalog.service'
import { BillingEntitlementService } from './billing-entitlement.service'
import { BillingPlanService } from './billing-plan.service'
import { BillingReconciliationService } from './billing-reconciliation.service'
import { BillingUsageService } from './billing-usage.service'
import { MobileOnboardingController } from './mobile-onboarding.controller'
import { MobileOnboardingService } from './mobile-onboarding.service'
import {
  MobileStorageHandoffCapabilityController,
  MobileStorageHandoffController,
  MobileStorageHandoffExchangeController,
} from './mobile-storage-handoff.controller'
import { MobileStorageHandoffService } from './mobile-storage-handoff.service'
import { StoragePlanService } from './storage-plan.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule],
  controllers: [
    BillingController,
    AppStoreBillingController,
    AppStoreNotificationController,
    MobileOnboardingController,
    MobileStorageHandoffController,
    MobileStorageHandoffExchangeController,
    MobileStorageHandoffCapabilityController,
  ],
  providers: [
    BillingUsageService,
    BillingPlanService,
    StoragePlanService,
    BillingCatalogService,
    BillingEntitlementService,
    BillingReconciliationService,
    AppStoreSignedDataService,
    AppStoreBillingService,
    MobileOnboardingService,
    MobileStorageHandoffService,
  ],
})
export class BillingModule {}
