import type { BizException } from '@core/errors'
import { ErrorCode } from '@core/errors'
import { describe, expect, it, vi } from 'vitest'

import { BILLING_PLAN_DEFINITIONS } from './billing-plan.constants'
import { BillingPlanService } from './billing-plan.service'
import type { BillingPlanId, BillingPlanOverrides, BillingPlanQuota } from './billing-plan.types'

function createService(customDomainLimit: number | null) {
  const service = new BillingPlanService({} as never, {} as never, {} as never)
  const quota: BillingPlanQuota = {
    customDomainLimit,
    libraryItemLimit: 500,
    maxSyncObjectSizeMb: 50,
    maxUploadSizeMb: 20,
    monthlyAssetProcessLimit: 300,
  }
  vi.spyOn(service, 'getQuotaForTenant').mockResolvedValue(quota)
  return service
}

describe('billingPlanService custom domain allowance', () => {
  it('rejects a plan without custom domain entitlement', async () => {
    const service = createService(0)

    const request = service.ensureCustomDomainAllowance('tenant-free', 0)

    await expect(request).rejects.toMatchObject<Partial<BizException>>({
      code: ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED,
    })
    await expect(request).rejects.toThrow('升级至 Pro')
  })

  it('allows the first Pro custom domain and rejects a second one', async () => {
    const service = createService(1)

    await expect(service.ensureCustomDomainAllowance('tenant-pro', 0)).resolves.toBeUndefined()
    await expect(service.ensureCustomDomainAllowance('tenant-pro', 1)).rejects.toThrow('1/1')
  })

  it('allows unlimited internal custom domains', async () => {
    const service = createService(null)

    await expect(service.ensureCustomDomainAllowance('tenant-friend', 100)).resolves.toBeUndefined()
  })

  it('reports whether the current plan may serve a custom domain', async () => {
    await expect(createService(0).hasCustomDomainEntitlement('tenant-free')).resolves.toBe(false)
    await expect(createService(1).hasCustomDomainEntitlement('tenant-pro')).resolves.toBe(true)
    await expect(createService(null).hasCustomDomainEntitlement('tenant-friend')).resolves.toBe(true)
  })
})

function createQuotaService(planId: BillingPlanId, overrides: BillingPlanOverrides = {}) {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ planId }] }) }) }),
  }
  const systemSettings = { getBillingPlanOverrides: vi.fn().mockResolvedValue(overrides) }
  return new BillingPlanService({ get: () => db } as never, systemSettings as never, {} as never)
}

describe('billingPlanService quota overrides', () => {
  it('returns the plan defaults when no override is configured', async () => {
    await expect(createQuotaService('free').getQuotaForTenant('tenant-free')).resolves.toEqual({
      customDomainLimit: 0,
      monthlyAssetProcessLimit: 300,
      libraryItemLimit: 500,
      maxUploadSizeMb: 20,
      maxSyncObjectSizeMb: 50,
    })
    await expect(createQuotaService('pro').getQuotaForTenant('tenant-pro')).resolves.toEqual(
      BILLING_PLAN_DEFINITIONS.pro.quotas,
    )
    await expect(createQuotaService('friend').getQuotaForTenant('tenant-friend')).resolves.toEqual(
      BILLING_PLAN_DEFINITIONS.friend.quotas,
    )
  })

  it('applies an explicit libraryItemLimit override of 100 as configured', async () => {
    const overrides = { free: { libraryItemLimit: 100 }, pro: { libraryItemLimit: 100 } }

    const free = await createQuotaService('free', overrides).getQuotaForTenant('tenant-free')
    const pro = await createQuotaService('pro', overrides).getQuotaForTenant('tenant-pro')

    expect(free).toEqual({ ...BILLING_PLAN_DEFINITIONS.free.quotas, libraryItemLimit: 100 })
    expect(pro).toEqual({ ...BILLING_PLAN_DEFINITIONS.pro.quotas, libraryItemLimit: 100 })
  })

  it('keeps the default libraryItemLimit when only other fields are overridden', async () => {
    const quota = await createQuotaService('free', {
      free: { monthlyAssetProcessLimit: 50, maxUploadSizeMb: 10 },
    }).getQuotaForTenant('tenant-free')

    expect(quota).toEqual({
      ...BILLING_PLAN_DEFINITIONS.free.quotas,
      monthlyAssetProcessLimit: 50,
      maxUploadSizeMb: 10,
    })
  })

  it('treats a null override as unlimited', async () => {
    const quota = await createQuotaService('pro', { pro: { libraryItemLimit: null } }).getQuotaForTenant('tenant-pro')

    expect(quota.libraryItemLimit).toBeNull()
    expect(quota.monthlyAssetProcessLimit).toBe(BILLING_PLAN_DEFINITIONS.pro.quotas.monthlyAssetProcessLimit)
  })

  it('ignores overrides configured for a different plan', async () => {
    const quota = await createQuotaService('pro', { free: { libraryItemLimit: 100 } }).getQuotaForTenant('tenant-pro')

    expect(quota).toEqual(BILLING_PLAN_DEFINITIONS.pro.quotas)
  })
})
