import { BizException, ErrorCode } from '@core/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TenantDomainService } from './tenant-domain.service'

vi.mock('@core/modules/platform/tenant/tenant.context', () => ({
  requireTenantContext: () => ({ tenant: { id: 'tenant-1' } }),
}))

describe('tenantDomainService plan enforcement', () => {
  const repository = {
    countByTenant: vi.fn(),
    createDomain: vi.fn(),
    deleteDomain: vi.fn(),
    findActiveByDomain: vi.fn(),
    findByDomain: vi.fn(),
    listByTenant: vi.fn(),
  }
  const systemSettings = {
    getSettings: vi.fn(),
  }
  const tenantService = {
    ensureTenantIsActive: vi.fn(),
  }
  const cloudflare = {
    createOrGet: vi.fn(),
    delete: vi.fn(),
  }
  const billingPlanService = {
    ensureCustomDomainAllowance: vi.fn(),
    hasCustomDomainEntitlement: vi.fn(),
  }

  const service = new TenantDomainService(
    repository as never,
    tenantService as never,
    systemSettings as never,
    cloudflare as never,
    billingPlanService as never,
  )

  beforeEach(() => {
    vi.clearAllMocks()
    repository.findByDomain.mockResolvedValue(null)
    repository.findActiveByDomain.mockResolvedValue(null)
    repository.countByTenant.mockResolvedValue(0)
    repository.listByTenant.mockResolvedValue([])
    systemSettings.getSettings.mockResolvedValue({ baseDomain: 'afilmory.art' })
    billingPlanService.hasCustomDomainEntitlement.mockResolvedValue(true)
  })

  it('stops before Cloudflare provisioning when the plan has no domain slot', async () => {
    billingPlanService.ensureCustomDomainAllowance.mockRejectedValue(
      new BizException(ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED, { message: 'Upgrade to Pro' }),
    )

    await expect(service.requestDomain('photos.example.net')).rejects.toThrow('Upgrade to Pro')

    expect(repository.countByTenant).toHaveBeenCalledWith('tenant-1')
    expect(cloudflare.createOrGet).not.toHaveBeenCalled()
  })

  it('provisions the hostname after the plan allowance succeeds', async () => {
    billingPlanService.ensureCustomDomainAllowance.mockResolvedValue(undefined)
    cloudflare.createOrGet.mockResolvedValue({
      hostname: 'photos.example.net',
      id: 'cf-hostname-1',
      ssl: { status: 'pending_validation' },
      status: 'pending',
    })
    repository.createDomain.mockResolvedValue({ domain: { id: 'domain-1' }, tenant: { id: 'tenant-1' } })

    await service.requestDomain('photos.example.net')

    expect(billingPlanService.ensureCustomDomainAllowance).toHaveBeenCalledWith('tenant-1', 0)
    expect(cloudflare.createOrGet).toHaveBeenCalledWith('photos.example.net')
  })

  it('does not resolve an active custom domain after the tenant loses its entitlement', async () => {
    repository.findActiveByDomain.mockResolvedValue({
      domain: { domain: 'photos.example.net', status: 'verified' },
      tenant: { id: 'tenant-1' },
    })
    billingPlanService.hasCustomDomainEntitlement.mockResolvedValue(false)

    await expect(service.resolveTenantByDomain('photos.example.net')).resolves.toBeNull()
  })

  it('deletes every Cloudflare hostname and local record when a tenant loses the plan entitlement', async () => {
    repository.listByTenant.mockResolvedValue([
      { id: 'domain-1', cloudflareHostnameId: 'cf-hostname-1' },
      { id: 'domain-2', cloudflareHostnameId: null },
    ])

    await expect(service.deleteDomainsForTenant('tenant-1')).resolves.toBe(2)

    expect(cloudflare.delete).toHaveBeenCalledOnce()
    expect(cloudflare.delete).toHaveBeenCalledWith('cf-hostname-1')
    expect(repository.deleteDomain).toHaveBeenNthCalledWith(1, 'domain-1')
    expect(repository.deleteDomain).toHaveBeenNthCalledWith(2, 'domain-2')
  })

  it('keeps the local record when Cloudflare deletion fails so a webhook retry can finish cleanup', async () => {
    repository.listByTenant.mockResolvedValue([{ id: 'domain-1', cloudflareHostnameId: 'cf-hostname-1' }])
    cloudflare.delete.mockRejectedValueOnce(new Error('Cloudflare unavailable'))

    await expect(service.deleteDomainsForTenant('tenant-1')).rejects.toThrow('Cloudflare unavailable')

    expect(repository.deleteDomain).not.toHaveBeenCalled()
  })
})
