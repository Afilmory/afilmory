import { describe, expect, it, vi } from 'vitest'

import { BillingOverviewService } from './billing-overview.service'

function createService(overrides: {
  managedProviderKey?: string | null
  storagePlan?: { id: string, name: string, capacityBytes: number | null } | null
  provider?: 'app_store' | 'creem' | null
}) {
  const plans = {
    getCurrentPlanSummary: vi.fn().mockResolvedValue({ planId: 'free', name: 'Free' }),
    getQuotaForTenant: vi.fn().mockResolvedValue({
      customDomainLimit: 0,
      libraryItemLimit: 5000,
      maxSyncObjectSizeMb: 100,
      maxUploadSizeMb: 25,
      monthlyAssetProcessLimit: 1000,
    }),
  }
  const storagePlans = {
    getPlanSummaryForTenant: vi.fn().mockResolvedValue(overrides.storagePlan ?? null),
    getQuotaForTenant: vi.fn().mockResolvedValue({ totalBytes: overrides.storagePlan?.capacityBytes ?? null }),
  }
  const managedStorage = {
    getUsageTotals: vi.fn().mockResolvedValue({ fileCount: 12, totalBytes: 4_100_000_000 }),
  }
  const systemSettings = {
    getManagedStorageProviderKey: vi.fn().mockResolvedValue(overrides.managedProviderKey ?? null),
  }
  const usage = { getUsageTotal: vi.fn().mockResolvedValue(640) }
  const repository = {
    countCustomDomains: vi.fn().mockResolvedValue(0),
    countLibraryItems: vi.fn().mockResolvedValue(4200),
    getActiveProvider: vi.fn().mockResolvedValue(overrides.provider ?? null),
  }

  return new BillingOverviewService(
    plans as never,
    storagePlans as never,
    managedStorage as never,
    systemSettings as never,
    usage as never,
    repository as never,
  )
}

describe('billingOverviewService', () => {
  it('reports no storage dimension when the workspace brings its own storage', async () => {
    const overview = await createService({ managedProviderKey: null }).getOverview('tenant-1')

    expect(overview.managedStorageEnabled).toBe(false)
    expect(overview.storagePlan).toBeNull()
    expect(overview.dimensions.find(d => d.reason === 'storage')).toBeUndefined()
  })

  it('passes the active provider through so the client can hide App Store purchase', async () => {
    const overview = await createService({
      managedProviderKey: 's3',
      storagePlan: { id: 'managed-5gb', name: '5 GB', capacityBytes: 5_368_709_120 },
      provider: 'creem',
    }).getOverview('tenant-1')

    expect(overview.subscriptionProvider).toBe('creem')
    expect(overview.dimensions.find(d => d.reason === 'storage')?.used).toBe(4_100_000_000)
    expect(overview.dimensions.find(d => d.reason === 'library_items')?.used).toBe(4200)
  })
})
