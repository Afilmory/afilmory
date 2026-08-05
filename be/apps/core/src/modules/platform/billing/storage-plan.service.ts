import { creemSubscriptions, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { createLogger } from '@tsuki-hono/common'
import { and, desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { BillingPlanService } from './billing-plan.service'
import { DEFAULT_STORAGE_PLAN_CATALOG } from './storage-plan.constants'
import type {
  StoragePlanCatalog,
  StoragePlanDefinition,
  StoragePlanOverview,
  StoragePlanPaymentInfo,
  StoragePlanPricing,
  StoragePlanSummary,
} from './storage-plan.types'

export interface StorageQuotaSummary {
  appIncludedBytes: number
  storagePlanBytes: number | null
  totalBytes: number | null
}

@injectable()
export class StoragePlanService {
  private readonly logger = createLogger('StoragePlanService')
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly systemSettingService: SystemSettingService,
    private readonly billingPlanService: BillingPlanService,
  ) {}

  async getPlanSummaries(): Promise<StoragePlanSummary[]> {
    const [catalog, pricing, products] = await Promise.all([
      this.getPlanCatalog(),
      this.systemSettingService.getStoragePlanPricing(),
      this.systemSettingService.getStoragePlanProducts(),
    ])

    return Object.entries(catalog)
      .map(([id, entry]) =>
        this.buildPlanSummary(
          {
            ...entry,
            id,
          },
          pricing[id],
          products[id],
        ))
      .filter(plan => plan.isActive !== false)
  }

  async getPlanById(planId: string): Promise<StoragePlanSummary | null> {
    const [catalog, pricing, products] = await Promise.all([
      this.getPlanCatalog(),
      this.systemSettingService.getStoragePlanPricing(),
      this.systemSettingService.getStoragePlanProducts(),
    ])

    const definition = catalog[planId]
    if (!definition) {
      return null
    }

    return this.buildPlanSummary({ ...definition, id: planId }, pricing[planId], products[planId])
  }

  async getQuotaForTenant(tenantId: string): Promise<StorageQuotaSummary> {
    const [tenantPlanId, resolvedPlanId, catalog] = await Promise.all([
      this.resolveStoragePlanIdForTenant(tenantId),
      this.billingPlanService.getPlanIdForTenant(tenantId),
      this.getPlanCatalog(),
    ])

    const appIncluded = this.billingPlanService.getIncludedStorageBytes(resolvedPlanId)
    const storagePlan = tenantPlanId ? catalog[tenantPlanId] : undefined
    const storagePlanCapacity = storagePlan?.capacityBytes
    const storagePlanBytes = storagePlanCapacity === undefined ? 0 : storagePlanCapacity

    const totalBytes
      = appIncluded === Number.POSITIVE_INFINITY || storagePlanCapacity === null
        ? null
        : (appIncluded || 0) + (storagePlanBytes || 0)

    return {
      appIncludedBytes: appIncluded,
      storagePlanBytes,
      totalBytes,
    }
  }

  async getPlanSummaryForTenant(tenantId: string): Promise<StoragePlanSummary | null> {
    const planId = await this.resolveStoragePlanIdForTenant(tenantId)
    if (!planId) {
      return null
    }
    const plan = await this.getPlanById(planId)
    if (!plan) {
      return null
    }
    return plan
  }

  async getActivePlanSummaryForTenant(tenantId: string): Promise<StoragePlanSummary | null> {
    const plan = await this.getPlanSummaryForTenant(tenantId)
    if (!plan || plan.isActive === false) {
      return null
    }

    const productId = plan.payment?.creemProductId ?? null
    if (!productId) {
      return plan
    }

    const subscription = await this.resolveLatestSubscriptionForTenant(tenantId, productId)
    if (!subscription) {
      return plan
    }

    const state = this.resolveSubscriptionState(subscription)
    return state === 'inactive' ? null : plan
  }

  async getOverviewForCurrentTenant(): Promise<StoragePlanOverview> {
    const tenant = requireTenantContext()
    const [plans, currentPlan, providerKey] = await Promise.all([
      this.getPlanSummaries(),
      this.getPlanSummaryForTenant(tenant.tenant.id),
      this.systemSettingService.getManagedStorageProviderKey(),
    ])

    return {
      managedStorageEnabled: Boolean(providerKey),
      managedProviderKey: providerKey ?? null,
      currentPlanId: currentPlan?.id ?? null,
      currentPlan,
      availablePlans: plans,
    }
  }

  async updateCurrentTenantPlan(planId: string | null): Promise<StoragePlanOverview> {
    const tenant = requireTenantContext()
    await this.assignPlanToTenant(tenant.tenant.id, planId)
    return await this.getOverviewForCurrentTenant()
  }

  /**
   * Update the managed storage plan for the given tenant directly (e.g. from billing webhooks).
   */
  async updateTenantPlan(tenantId: string, planId: string | null): Promise<void> {
    await this.assignPlanToTenant(tenantId, planId)
  }

  private async resolveStoragePlanIdForTenant(tenantId: string): Promise<string | null> {
    const db = this.dbAccessor.get()
    const [record] = await db
      .select({ storagePlanId: tenants.storagePlanId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)

    if (!record) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }
    const planId = record.storagePlanId?.trim()
    return planId && planId.length > 0 ? planId : null
  }

  private async resolveLatestSubscriptionForTenant(tenantId: string, productId: string) {
    const db = this.dbAccessor.get()
    const [record] = await db
      .select()
      .from(creemSubscriptions)
      .where(and(eq(creemSubscriptions.tenantId, tenantId), eq(creemSubscriptions.productId, productId)))
      .orderBy(desc(creemSubscriptions.updatedAt))
      .limit(1)

    return record ?? null
  }

  private resolveSubscriptionState(
    subscription: typeof creemSubscriptions.$inferSelect,
  ): 'active' | 'inactive' | 'unknown' {
    const now = Date.now()
    const status = subscription.status?.toLowerCase() ?? null
    const periodEndRaw = subscription.periodEnd
    const periodEnd = periodEndRaw ? new Date(periodEndRaw).getTime() : null
    const hasValidPeriodEnd = periodEnd !== null && !Number.isNaN(periodEnd)

    if (hasValidPeriodEnd && periodEnd <= now) {
      return 'inactive'
    }

    const activeStatuses = new Set(['active', 'trialing', 'paid'])
    if (status && activeStatuses.has(status)) {
      return 'active'
    }

    if (subscription.cancelAtPeriodEnd && hasValidPeriodEnd && periodEnd > now) {
      return 'active'
    }

    const inactiveStatuses = new Set(['canceled', 'cancelled', 'expired', 'past_due', 'unpaid'])
    if (status && inactiveStatuses.has(status)) {
      return 'inactive'
    }

    return 'unknown'
  }

  private async getPlanCatalog(): Promise<Record<string, StoragePlanDefinition>> {
    const config = await this.systemSettingService.getStoragePlanCatalog()
    const merged: StoragePlanCatalog = { ...DEFAULT_STORAGE_PLAN_CATALOG, ...config }
    return Object.entries(merged).reduce<Record<string, StoragePlanDefinition>>((acc, [id, entry]) => {
      if (!id) {
        return acc
      }
      acc[id] = {
        id,
        name: entry.name,
        description: entry.description ?? null,
        capacityBytes: entry.capacityBytes ?? 0,
        isActive: entry.isActive ?? true,
      }
      return acc
    }, {})
  }

  private buildPlanSummary(
    definition: StoragePlanDefinition,
    pricing?: StoragePlanPricing,
    payment?: StoragePlanPaymentInfo,
  ): StoragePlanSummary {
    return {
      ...definition,
      pricing,
      payment,
    }
  }

  private async assignPlanToTenant(tenantId: string, planId: string | null): Promise<void> {
    const normalizedPlanId = this.normalizePlanId(planId)
    const managedProviderKey = await this.systemSettingService.getManagedStorageProviderKey()
    if (!managedProviderKey) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '托管存储尚未启用，暂时无法订阅托管存储方案。',
      })
    }

    if (normalizedPlanId) {
      const plan = await this.getPlanById(normalizedPlanId)
      if (!plan || plan.isActive === false) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: `未知或未启用的托管存储方案：${normalizedPlanId}`,
        })
      }
    }

    await this.persistTenantStoragePlan(tenantId, normalizedPlanId)
  }

  private async persistTenantStoragePlan(tenantId: string, planId: string | null): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(tenants)
      .set({ storagePlanId: planId, updatedAt: new Date().toISOString() })
      .where(eq(tenants.id, tenantId))
  }

  private normalizePlanId(planId?: string | null): string | null {
    if (typeof planId !== 'string') {
      return null
    }
    const trimmed = planId.trim()
    return trimmed.length > 0 ? trimmed : null
  }
}
