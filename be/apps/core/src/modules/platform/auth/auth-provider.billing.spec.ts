import { describe, expect, it, vi } from 'vitest'

import { AuthProvider } from './auth.provider'

interface CreemWebhookInvoker {
  handleCreemWebhook: (params: {
    event: string
    metadata?: Record<string, unknown> | null
    status?: string | null
    forceRevoke?: boolean
  }) => Promise<void>
}

function createProvider() {
  const billingPlanService = {
    updateTenantPlan: vi.fn().mockResolvedValue(undefined),
  }
  const storagePlanService = {
    updateTenantPlan: vi.fn().mockResolvedValue(undefined),
  }
  const tenantDomainService = {
    deleteDomainsForTenant: vi.fn().mockResolvedValue(1),
  }
  const provider = new AuthProvider(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    billingPlanService as never,
    storagePlanService as never,
    tenantDomainService as never,
  )

  return {
    billingPlanService,
    provider: provider as unknown as CreemWebhookInvoker,
    tenantDomainService,
  }
}

describe('authProvider billing revocation', () => {
  it('deletes custom domains after an expired subscription downgrades the tenant', async () => {
    const { billingPlanService, provider, tenantDomainService } = createProvider()

    await provider.handleCreemWebhook({
      event: 'subscription.expired',
      metadata: { planId: 'pro', tenantId: 'tenant-1' },
      status: 'expired',
      forceRevoke: true,
    })

    expect(billingPlanService.updateTenantPlan).toHaveBeenCalledWith('tenant-1', 'free')
    expect(tenantDomainService.deleteDomainsForTenant).toHaveBeenCalledWith('tenant-1')
  })

  it('propagates domain cleanup failures so the expired webhook can be retried', async () => {
    const { provider, tenantDomainService } = createProvider()
    tenantDomainService.deleteDomainsForTenant.mockRejectedValueOnce(new Error('Cloudflare unavailable'))

    await expect(
      provider.handleCreemWebhook({
        event: 'subscription.expired',
        metadata: { planId: 'pro', tenantId: 'tenant-1' },
        status: 'expired',
        forceRevoke: true,
      }),
    ).rejects.toThrow('Cloudflare unavailable')
  })
})
