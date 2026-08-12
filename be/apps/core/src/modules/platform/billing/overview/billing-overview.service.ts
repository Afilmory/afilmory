import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { ManagedStorageService } from '@core/modules/platform/managed-storage/managed-storage.service'
import { injectable } from 'tsyringe'

import { BillingPlanService, startOfUtcMonth } from '../plan/billing-plan.service'
import { StoragePlanService } from '../plan/storage-plan.service'
import { summarizeQuotas } from '../quota/billing-quota.policy'
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
  ) {}

  async getOverview(tenantId: string): Promise<BillingOverview> {
    const providerKey = await this.systemSettings.getManagedStorageProviderKey()
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

    const storageUsage = providerKey ? await this.managedStorage.getUsageTotals(providerKey, tenantId) : null

    const dimensions = summarizeQuotas({
      customDomains: { limit: quota.customDomainLimit, used: customDomains },
      libraryItems: { limit: quota.libraryItemLimit, used: libraryItems },
      monthlyProcess: { limit: quota.monthlyAssetProcessLimit, used: monthlyUsed },
      storage: { limit: storageQuota.totalBytes, used: storageUsage?.totalBytes ?? 0 },
    }).filter(dimension => dimension.reason !== 'storage' || storageUsage !== null)

    return {
      applicationPlan: { id: plan.planId, name: plan.name },
      storagePlan: storageUsage === null ? null : storagePlan,
      managedStorageEnabled: storageUsage !== null,
      subscriptionProvider: provider,
      dimensions,
    }
  }
}
