import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { PhotoStorageService } from '@core/modules/content/photo/storage/photo-storage.service'
import { ManagedStorageService } from '@core/modules/platform/managed-storage/managed-storage.service'
import { injectable } from 'tsyringe'

import { BillingPlanService, startOfUtcMonth } from '../plan/billing-plan.service'
import { StoragePlanService } from '../plan/storage-plan.service'
import { resolveLibraryItemLimit, summarizeQuotas } from '../quota/billing-quota.policy'
import { BILLING_USAGE_EVENT } from '../usage/billing-usage.constants'
import { BillingUsageService } from '../usage/billing-usage.service'
import { BillingOverviewRepository } from './billing-overview.repository'
import type { BillingOverview } from './billing-overview.types'

@injectable()
export class BillingOverviewService {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly storagePlans: StoragePlanService,
    private readonly managedStorage: ManagedStorageService,
    private readonly systemSettings: SystemSettingService,
    private readonly usage: BillingUsageService,
    private readonly repository: BillingOverviewRepository,
    private readonly photoStorage: PhotoStorageService,
  ) {}

  async getOverview(tenantId: string): Promise<BillingOverview> {
    const [providerKey, usesManagedStorage] = await Promise.all([
      this.systemSettings.getManagedStorageProviderKey(),
      this.photoStorage.isManagedStorageActiveForTenant(tenantId),
    ])
    const [plan, quota, storagePlan, storageQuota, monthlyUsed, libraryItems, customDomains, provider]
      = await Promise.all([
        this.plans.getCurrentPlanSummary(),
        this.plans.getQuotaForTenant(tenantId),
        this.storagePlans.getPlanSummaryForTenant(tenantId),
        this.storagePlans.getQuotaForTenant(tenantId),
        this.usage.getUsageTotal(tenantId, BILLING_USAGE_EVENT.PHOTO_ASSET_CREATED, { since: startOfUtcMonth() }),
        this.repository.countLibraryItems(tenantId),
        this.repository.countCustomDomains(tenantId),
        this.repository.getActiveProvider(tenantId),
      ])

    // The storage and library item limits only apply when the tenant's effective storage is managed;
    // a BYO tenant is unaffected by whether the deployment offers managed storage.
    const storageUsage
      = usesManagedStorage && providerKey ? await this.managedStorage.getUsageTotals(providerKey, tenantId) : null

    const dimensions = summarizeQuotas({
      customDomains: { limit: quota.customDomainLimit, used: customDomains },
      libraryItems: { limit: resolveLibraryItemLimit(quota.libraryItemLimit, usesManagedStorage), used: libraryItems },
      monthlyProcess: { limit: quota.monthlyAssetProcessLimit, used: monthlyUsed },
      storage: { limit: storageQuota.totalBytes, used: storageUsage?.totalBytes ?? 0 },
    }).filter(dimension => dimension.reason !== 'storage' || usesManagedStorage)

    // `managedStorageEnabled` and `storagePlan` describe what the deployment offers and what the
    // workspace subscribes to; clients use them to show the managed storage purchase section even
    // to BYO workspaces, so they stay independent of the active storage provider.
    const managedStorageEnabled = Boolean(providerKey)
    return {
      applicationPlan: { id: plan.planId, name: plan.name },
      storagePlan: managedStorageEnabled ? storagePlan : null,
      managedStorageEnabled,
      subscriptionProvider: provider,
      dimensions,
    }
  }
}
