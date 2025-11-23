import { tenants } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeString } from 'core/helpers/normalize.helper'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { BILLING_USAGE_EVENT } from './billing.constants'
import { BILLING_PLAN_DEFINITIONS, BILLING_PLAN_IDS } from './billing-plan.constants'
import type {
  BillingPlanDefinition,
  BillingPlanId,
  BillingPlanOverrides,
  BillingPlanPaymentInfo,
  BillingPlanPricing,
  BillingPlanPricingConfigs,
  BillingPlanProductConfigs,
  BillingPlanQuota,
  BillingPlanQuotaOverride,
} from './billing-plan.types'
import { BillingUsageService } from './billing-usage.service'

function startOfUtcMonth(reference = new Date()): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0))
}

@injectable()
export class BillingPlanService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly systemSettingService: SystemSettingService,
    private readonly billingUsageService: BillingUsageService,
  ) {}

  async getCurrentPlanId(): Promise<BillingPlanId> {
    const tenant = requireTenantContext()
    return await this.resolvePlanIdForTenant(tenant.tenant.id)
  }

  async getQuotaForCurrentTenant(): Promise<BillingPlanQuota> {
    const tenant = requireTenantContext()
    return await this.getQuotaForTenant(tenant.tenant.id)
  }

  async getQuotaForTenant(tenantId: string): Promise<BillingPlanQuota> {
    const planId = await this.resolvePlanIdForTenant(tenantId)
    const definition = BILLING_PLAN_DEFINITIONS[planId]
    const overrides = await this.getPlanOverrides()
    return this.applyOverrides(definition.quotas, overrides[planId])
  }

  async getPlanIdForTenant(tenantId: string): Promise<BillingPlanId> {
    return await this.resolvePlanIdForTenant(tenantId)
  }

  getIncludedStorageBytes(planId: BillingPlanId): number {
    const definition = BILLING_PLAN_DEFINITIONS[planId]
    if (!definition) {
      return 0
    }
    if (definition.includedStorageBytes === null) {
      return Number.POSITIVE_INFINITY
    }
    return definition.includedStorageBytes ?? 0
  }

  getPlanDefinitions(): BillingPlanDefinition[] {
    return BILLING_PLAN_IDS.map((id) => {
      const definition = BILLING_PLAN_DEFINITIONS[id]
      return {
        ...definition,
        quotas: { ...definition.quotas },
      }
    })
  }

  async getCurrentPlanSummary(): Promise<BillingPlanSummary> {
    const tenant = requireTenantContext()
    return await this.getPlanSummaryForTenant(tenant.tenant.id)
  }

  async getPlanSummaryForTenant(tenantId: string): Promise<BillingPlanSummary> {
    const [planId, overrides, productConfigs, pricingConfigs] = await Promise.all([
      this.resolvePlanIdForTenant(tenantId),
      this.getPlanOverrides(),
      this.getPlanProducts(),
      this.getPlanPricing(),
    ])

    const definition = BILLING_PLAN_DEFINITIONS[planId]
    const quotas = this.applyOverrides(definition.quotas, overrides[planId])
    return {
      planId,
      name: definition.name,
      description: definition.description,
      quotas,
      payment: this.buildPaymentInfo(productConfigs[planId]),
      pricing: this.buildPricingInfo(pricingConfigs[planId]),
    }
  }

  async getPublicPlanSummaries(): Promise<BillingPlanSummary[]> {
    const [overrides, productConfigs, pricingConfigs] = await Promise.all([
      this.getPlanOverrides(),
      this.getPlanProducts(),
      this.getPlanPricing(),
    ])
    return BILLING_PLAN_IDS.map((id) => {
      const definition = BILLING_PLAN_DEFINITIONS[id]
      return {
        planId: id,
        name: definition.name,
        description: definition.description,
        quotas: this.applyOverrides(definition.quotas, overrides[id]),
        payment: this.buildPaymentInfo(productConfigs[id]),
        pricing: this.buildPricingInfo(pricingConfigs[id]),
      }
    }).filter((plan) => this.shouldExposePlan(plan.planId, plan.payment))
  }

  async ensurePhotoProcessingAllowance(tenantId: string, incomingItems: number): Promise<void> {
    if (incomingItems <= 0) {
      return
    }

    const quota = await this.getQuotaForTenant(tenantId)
    if (!quota.monthlyAssetProcessLimit) {
      return
    }

    const monthStart = startOfUtcMonth()
    const used = await this.billingUsageService.getUsageTotal(tenantId, BILLING_USAGE_EVENT.PHOTO_ASSET_CREATED, {
      since: monthStart,
    })

    if (used + incomingItems > quota.monthlyAssetProcessLimit) {
      const remaining = Math.max(quota.monthlyAssetProcessLimit - used, 0)
      throw new BizException(ErrorCode.BILLING_QUOTA_EXCEEDED, {
        message: `当月新增照片额度不足，可用剩余：${remaining}，请求新增：${incomingItems}。升级订阅后即可提升限额。`,
      })
    }
  }

  async updateTenantPlan(tenantId: string, planId: BillingPlanId): Promise<void> {
    if (!BILLING_PLAN_IDS.includes(planId)) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: `未知订阅计划：${planId}` })
    }
    const db = this.dbAccessor.get()
    await db.update(tenants).set({ planId, updatedAt: new Date().toISOString() }).where(eq(tenants.id, tenantId))
  }

  private async resolvePlanIdForTenant(tenantId: string): Promise<BillingPlanId> {
    const db = this.dbAccessor.get()
    const [record] = await db.select({ planId: tenants.planId }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    const planId = record?.planId ?? 'free'
    return BILLING_PLAN_IDS.includes(planId as BillingPlanId) ? (planId as BillingPlanId) : 'free'
  }

  private async getPlanOverrides(): Promise<BillingPlanOverrides> {
    return await this.systemSettingService.getBillingPlanOverrides()
  }

  private async getPlanProducts(): Promise<BillingPlanProductConfigs> {
    return await this.systemSettingService.getBillingPlanProducts()
  }

  private async getPlanPricing(): Promise<BillingPlanPricingConfigs> {
    return await this.systemSettingService.getBillingPlanPricing()
  }

  private applyOverrides(base: BillingPlanQuota, override?: BillingPlanQuotaOverride): BillingPlanQuota {
    if (!override) {
      return { ...base }
    }
    return {
      monthlyAssetProcessLimit:
        override.monthlyAssetProcessLimit !== undefined
          ? override.monthlyAssetProcessLimit
          : base.monthlyAssetProcessLimit,
      libraryItemLimit: override.libraryItemLimit !== undefined ? override.libraryItemLimit : base.libraryItemLimit,
      maxUploadSizeMb: override.maxUploadSizeMb !== undefined ? override.maxUploadSizeMb : base.maxUploadSizeMb,
      maxSyncObjectSizeMb:
        override.maxSyncObjectSizeMb !== undefined ? override.maxSyncObjectSizeMb : base.maxSyncObjectSizeMb,
    }
  }

  private buildPaymentInfo(entry?: BillingPlanPaymentInfo): BillingPlanPaymentInfo | undefined {
    if (!entry) {
      return undefined
    }
    const creemProductId = normalizeString(entry.creemProductId)
    if (!creemProductId) {
      return undefined
    }
    return { creemProductId }
  }

  private shouldExposePlan(planId: BillingPlanId, payment?: BillingPlanPaymentInfo): boolean {
    if (planId === 'free') {
      return true
    }

    return Boolean(payment?.creemProductId)
  }

  private buildPricingInfo(entry?: BillingPlanPricing): BillingPlanPricing | undefined {
    if (!entry) {
      return undefined
    }
    const hasPrice = entry.monthlyPrice !== null && !Number.isNaN(entry.monthlyPrice ?? undefined)
    const hasCurrency = !!entry.currency
    if (!hasPrice && !hasCurrency) {
      return undefined
    }
    return {
      monthlyPrice: hasPrice ? entry.monthlyPrice : null,
      currency: entry.currency ?? null,
    }
  }
}

export interface BillingPlanSummary {
  planId: BillingPlanId
  name: string
  description: string
  quotas: BillingPlanQuota
  pricing?: BillingPlanPricing
  payment?: BillingPlanPaymentInfo
}
