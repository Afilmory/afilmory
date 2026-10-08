import { Buffer } from 'node:buffer'

import type { StorageConfig } from '@afilmory/builder'
import type { BizException } from '@core/errors'
import { ErrorCode } from '@core/errors'
import { describe, expect, it, vi } from 'vitest'

import { PhotoAssetService } from './photo-asset.service'

vi.mock('@core/modules/platform/tenant/tenant.context', () => ({
  requireTenantContext: () => ({ tenant: { id: 'tenant-1' } }),
}))

vi.mock('../storage/transactional-storage.manager', () => ({
  TransactionalStorageManager: class {
    rollbackUploads = vi.fn(async () => {})
  },
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

const input = { filename: 'new.jpg', buffer: Buffer.alloc(1024), contentType: 'image/jpeg' }

// Stops the upload right after the quota checks so the test does not need real storage or a database.
const PASSED_QUOTA_CHECKS = new Error('passed quota checks')

type Internals = Record<string, (...args: never[]) => unknown>

function createService(options: { storageConfig: StorageConfig, currentPhotos: number }) {
  const billingPlanService = {
    getQuotaForTenant: vi.fn().mockResolvedValue(freeQuota),
    ensurePhotoProcessingAllowance: vi.fn().mockResolvedValue(undefined),
  }
  const photoStorageService = {
    resolveConfigForTenant: vi.fn().mockResolvedValue({ builderConfig: {}, storageConfig: options.storageConfig }),
  }
  const photoBuilderService = {
    createBuilder: vi.fn(() => ({ setStorageManager: vi.fn(), ensurePluginsReady: vi.fn(async () => {}) })),
    applyStorageConfig: vi.fn(),
  }
  const service = new PhotoAssetService(
    { get: () => ({}) } as never,
    photoBuilderService as never,
    photoStorageService as never,
    billingPlanService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

  const internals = service as unknown as Internals
  vi.spyOn(internals, 'prepareUploadPlans').mockReturnValue({
    photoPlans: [
      { original: input, storageKey: 'new.jpg', baseName: 'new', groupKey: 'new', isVideo: false, isExisting: false },
    ],
    videoPlans: [],
  })
  vi.spyOn(internals, 'collectExistingPhotoRecords').mockResolvedValue({
    items: [],
    keySet: new Set(),
    baseNameMap: new Map(),
  })
  vi.spyOn(internals, 'collectExistingPhotoIds').mockResolvedValue(new Set())
  vi.spyOn(internals, 'countTenantPhotos').mockResolvedValue(options.currentPhotos)
  vi.spyOn(internals, 'createExistingPhotoPlansForVideos').mockImplementation(() => {
    throw PASSED_QUOTA_CHECKS
  })

  return { service, billingPlanService }
}

describe('photoAssetService upload quotas', () => {
  it('lets a BYO workspace with more than 100 photos keep uploading', async () => {
    const { service, billingPlanService } = createService({ storageConfig: byoStorage, currentPhotos: 150 })

    await expect(service.uploadAssets([input])).rejects.toBe(PASSED_QUOTA_CHECKS)
    expect(billingPlanService.ensurePhotoProcessingAllowance).toHaveBeenCalledWith('tenant-1', 1)
  })

  it('enforces the plan library item limit on managed storage', async () => {
    const { service } = createService({ storageConfig: managedStorage, currentPhotos: 100 })

    await expect(service.uploadAssets([input])).rejects.toMatchObject({
      code: ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED,
      details: { reason: 'library_items', limit: 100, current: 100 },
    } satisfies Partial<BizException>)
  })

  it('lets a managed workspace upload while under the plan library item limit', async () => {
    const { service } = createService({ storageConfig: managedStorage, currentPhotos: 99 })

    await expect(service.uploadAssets([input])).rejects.toBe(PASSED_QUOTA_CHECKS)
  })

  it('still enforces the monthly processing allowance for BYO storage', async () => {
    const { service, billingPlanService } = createService({ storageConfig: byoStorage, currentPhotos: 0 })
    billingPlanService.ensurePhotoProcessingAllowance.mockRejectedValue(new Error('monthly allowance exceeded'))

    await expect(service.uploadAssets([input])).rejects.toThrow('monthly allowance exceeded')
  })

  it('still enforces the single-file upload size limit for BYO storage', async () => {
    const { service } = createService({ storageConfig: byoStorage, currentPhotos: 0 })
    const oversized = { ...input, buffer: Buffer.alloc(21 * 1024 * 1024) }

    await expect(service.uploadAssets([oversized])).rejects.toMatchObject({
      code: ErrorCode.BILLING_PLAN_QUOTA_EXCEEDED,
      details: { reason: 'upload_size', limitMb: 20 },
    })
  })
})
