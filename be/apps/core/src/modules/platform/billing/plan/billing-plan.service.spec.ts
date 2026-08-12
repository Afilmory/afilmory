import type { BizException } from '@core/errors'
import { ErrorCode } from '@core/errors'
import { describe, expect, it, vi } from 'vitest'

import { BillingPlanService } from './billing-plan.service'
import type { BillingPlanQuota } from './billing-plan.types'

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
