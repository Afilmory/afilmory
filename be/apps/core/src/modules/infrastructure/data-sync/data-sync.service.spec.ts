import type { StorageConfig } from '@afilmory/builder'
import { describe, expect, it, vi } from 'vitest'

import { DataSyncService } from './data-sync.service'

vi.mock('@core/modules/platform/tenant/tenant.context', () => ({
  requireTenantContext: () => ({ tenant: { id: 'tenant-1' } }),
}))

const byoStorage: StorageConfig = { provider: 's3', bucket: 'photos' }
const managedStorage: StorageConfig = {
  provider: 'managed',
  providerKey: 'managed-upstream',
  tenantId: 'tenant-1',
  upstream: { provider: 's3', bucket: 'afilmory-managed' },
  basePrefix: null,
}

const freeQuota = {
  customDomainLimit: 0,
  monthlyAssetProcessLimit: 300,
  libraryItemLimit: 100,
  maxUploadSizeMb: 20,
  maxSyncObjectSizeMb: 50,
}

// Stops the sync once new storage objects would be processed, after every quota check has run.
const PASSED_QUOTA_CHECKS = new Error('passed quota checks')

type Internals = Record<string, (...args: never[]) => unknown>

function createService(options: { storageConfig: StorageConfig, currentPhotos: number, incomingPhotos: number }) {
  const billingPlanService = {
    getQuotaForTenant: vi.fn().mockResolvedValue(freeQuota),
    ensurePhotoProcessingAllowance: vi.fn().mockResolvedValue(undefined),
  }
  const photoStorageService = {
    resolveConfigForTenant: vi.fn().mockResolvedValue({ builderConfig: {}, storageConfig: options.storageConfig }),
  }
  const service = new DataSyncService(
    {} as never,
    {} as never,
    {} as never,
    photoStorageService as never,
    billingPlanService as never,
    {} as never,
    {} as never,
    {} as never,
  )

  const internals = service as unknown as Internals
  vi.spyOn(internals, 'prepareSyncContext').mockResolvedValue({
    storageObjects: [],
    records: Array.from({ length: options.currentPhotos }).fill({}),
    missingInDb: Array.from({ length: options.incomingPhotos }).fill({}),
    orphanInDb: [],
    conflictCandidates: [],
    statusReconciliation: [],
  })
  const handleNewStorageObjects = vi.spyOn(internals, 'handleNewStorageObjects').mockRejectedValue(PASSED_QUOTA_CHECKS)

  return { service, billingPlanService, handleNewStorageObjects }
}

describe('dataSyncService quotas', () => {
  it('lets a BYO workspace with more than 100 photos keep syncing', async () => {
    const { service, billingPlanService, handleNewStorageObjects } = createService({
      storageConfig: byoStorage,
      currentPhotos: 150,
      incomingPhotos: 5,
    })

    await expect(service.runSync({ dryRun: false })).rejects.toBe(PASSED_QUOTA_CHECKS)
    expect(billingPlanService.ensurePhotoProcessingAllowance).toHaveBeenCalledWith('tenant-1', 5)
    // The per-object sync size limit is unaffected by the storage mode.
    expect(handleNewStorageObjects.mock.calls[0]?.at(-1)).toEqual({
      maxObjectBytes: 50 * 1024 * 1024,
      maxObjectSizeMb: 50,
    })
  })

  it('enforces the plan library item limit on managed storage', async () => {
    const { service, billingPlanService, handleNewStorageObjects } = createService({
      storageConfig: managedStorage,
      currentPhotos: 98,
      incomingPhotos: 5,
    })

    await expect(service.runSync({ dryRun: false })).rejects.toThrow('超过上限 100')
    expect(billingPlanService.ensurePhotoProcessingAllowance).not.toHaveBeenCalled()
    expect(handleNewStorageObjects).not.toHaveBeenCalled()
  })

  it('lets a managed workspace sync while under the plan library item limit', async () => {
    const { service } = createService({ storageConfig: managedStorage, currentPhotos: 95, incomingPhotos: 5 })

    await expect(service.runSync({ dryRun: false })).rejects.toBe(PASSED_QUOTA_CHECKS)
  })

  it('still enforces the monthly processing allowance for BYO storage', async () => {
    const { service, billingPlanService, handleNewStorageObjects } = createService({
      storageConfig: byoStorage,
      currentPhotos: 150,
      incomingPhotos: 5,
    })
    billingPlanService.ensurePhotoProcessingAllowance.mockRejectedValue(new Error('monthly allowance exceeded'))

    await expect(service.runSync({ dryRun: false })).rejects.toThrow('monthly allowance exceeded')
    expect(handleNewStorageObjects).not.toHaveBeenCalled()
  })
})
