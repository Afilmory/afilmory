import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'

import { BillingOverviewService } from './billing-overview.service'

function createService(overrides: {
  managedProviderKey?: string | null
  usesManagedStorage?: boolean
  storagePlan?: { id: string, name: string, capacityBytes: number | null } | null
  storageUsage?: { fileCount: number, totalBytes: number }
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
    getUsageTotals: vi.fn().mockResolvedValue(overrides.storageUsage ?? { fileCount: 12, totalBytes: 4_100_000_000 }),
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
  const photoStorage = {
    isManagedStorageActiveForTenant: vi.fn().mockResolvedValue(overrides.usesManagedStorage ?? false),
  }

  const service = new BillingOverviewService(
    plans as never,
    storagePlans as never,
    managedStorage as never,
    systemSettings as never,
    usage as never,
    repository as never,
    photoStorage as never,
  )
  return { service, managedStorage, photoStorage }
}

const managedPlan = { id: 'managed-5gb', name: '5 GB', capacityBytes: 5_368_709_120 }

describe('billingOverviewService', () => {
  it('reports no storage dimension when the workspace brings its own storage', async () => {
    const { service } = createService({ managedProviderKey: null })
    const overview = await service.getOverview('tenant-1')

    expect(overview.managedStorageEnabled).toBe(false)
    expect(overview.storagePlan).toBeNull()
    expect(overview.dimensions.find(d => d.reason === 'storage')).toBeUndefined()
    expect(overview.dimensions.find(d => d.reason === 'library_items')?.limit).toBeNull()
  })

  it('does not apply managed quotas to a BYO workspace when managed storage is enabled globally', async () => {
    const { service, managedStorage, photoStorage } = createService({
      managedProviderKey: 's3',
      usesManagedStorage: false,
    })
    const overview = await service.getOverview('tenant-1')

    expect(photoStorage.isManagedStorageActiveForTenant).toHaveBeenCalledWith('tenant-1')
    expect(managedStorage.getUsageTotals).not.toHaveBeenCalled()
    expect(overview.dimensions.find(d => d.reason === 'storage')).toBeUndefined()
    expect(overview.dimensions.find(d => d.reason === 'library_items')).toMatchObject({ limit: null, used: 4200 })
    expect(overview.dimensions.find(d => d.reason === 'monthly_process')).toMatchObject({ limit: 1000, used: 640 })
    // Managed storage is still offered to the workspace, so the purchase section stays available.
    expect(overview.managedStorageEnabled).toBe(true)
  })

  it('treats a managed workspace with no files yet as managed', async () => {
    const { service, managedStorage } = createService({
      managedProviderKey: 's3',
      usesManagedStorage: true,
      storagePlan: managedPlan,
      storageUsage: { fileCount: 0, totalBytes: 0 },
    })
    const overview = await service.getOverview('tenant-1')

    expect(managedStorage.getUsageTotals).toHaveBeenCalledWith('s3', 'tenant-1')
    expect(overview.managedStorageEnabled).toBe(true)
    expect(overview.storagePlan).toEqual(managedPlan)
    expect(overview.dimensions.find(d => d.reason === 'storage')).toMatchObject({
      limit: 5_368_709_120,
      used: 0,
    })
    expect(overview.dimensions.find(d => d.reason === 'library_items')?.limit).toBe(5000)
  })

  it('passes the active provider through so the client can hide App Store purchase', async () => {
    const { service } = createService({
      managedProviderKey: 's3',
      usesManagedStorage: true,
      storagePlan: managedPlan,
      provider: 'creem',
    })
    const overview = await service.getOverview('tenant-1')

    expect(overview.subscriptionProvider).toBe('creem')
    expect(overview.dimensions.find(d => d.reason === 'storage')?.used).toBe(4_100_000_000)
    expect(overview.dimensions.find(d => d.reason === 'library_items')?.used).toBe(4200)
  })
})
