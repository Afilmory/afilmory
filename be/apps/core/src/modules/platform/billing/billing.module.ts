import { DatabaseModule } from '@core/database/database.module'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { ManagedStorageModule } from '@core/modules/platform/managed-storage/managed-storage.module'
import { Module } from '@tsuki-hono/common'

import { BillingController } from './billing.controller'
import { BillingCatalogListener } from './catalog/billing-catalog.listener'
import { BillingCatalogService } from './catalog/billing-catalog.service'
import { BillingEntitlementService } from './entitlement/billing-entitlement.service'
import { BillingOverviewRepository } from './overview/billing-overview.repository'
import { BillingOverviewService } from './overview/billing-overview.service'
import { BillingPlanService } from './plan/billing-plan.service'
import { StoragePlanService } from './plan/storage-plan.service'
import {
  AppStoreBillingController,
  AppStoreNotificationController,
} from './providers/app-store/app-store-billing.controller'
import { AppStoreBillingService } from './providers/app-store/app-store-billing.service'
import { AppStoreSignedDataService } from './providers/app-store/app-store-signed-data.service'
import { BillingProviderEventService } from './providers/billing-provider-event.service'
import { CreemBillingService } from './providers/creem/creem-billing.service'
import { CreemWebhookService } from './providers/creem/creem-webhook.service'
import { BillingUsageService } from './usage/billing-usage.service'

@Module({
  imports: [DatabaseModule, SystemSettingModule, ManagedStorageModule],
  controllers: [BillingController, AppStoreBillingController, AppStoreNotificationController],
  providers: [
    BillingUsageService,
    BillingPlanService,
    StoragePlanService,
    BillingCatalogService,
    BillingCatalogListener,
    BillingEntitlementService,
    BillingOverviewRepository,
    BillingOverviewService,
    BillingProviderEventService,
    AppStoreSignedDataService,
    AppStoreBillingService,
    CreemBillingService,
    CreemWebhookService,
  ],
})
export class BillingModule {}
