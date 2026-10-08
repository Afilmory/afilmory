import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'

import { PhotoStorageService } from './photo-storage.service'

const s3Provider = {
  id: 'my-s3',
  name: 'My S3',
  type: 's3',
  config: { bucket: 'photos', region: 'us-east-1' },
}
const managedUpstream = {
  id: 'managed-upstream',
  name: 'Managed upstream',
  type: 's3',
  config: { bucket: 'afilmory-managed' },
}

function createService(options: {
  activeProvider: string | null
  storagePlan?: { id: string } | null
  tenantProvider?: typeof s3Provider | null
  managedProvider?: typeof managedUpstream | null
}) {
  const settingService = {
    get: vi.fn().mockResolvedValue(options.activeProvider),
    getActiveStorageProvider: vi.fn().mockResolvedValue(options.tenantProvider ?? null),
  }
  const builderConfigService = { getConfigForTenant: vi.fn().mockImplementation(async () => ({})) }
  const systemSettingService = {
    getManagedStorageProvider: vi.fn().mockResolvedValue(options.managedProvider ?? null),
  }
  const storagePlanService = {
    getActivePlanSummaryForTenant: vi.fn().mockResolvedValue(options.storagePlan ?? null),
  }
  const service = new PhotoStorageService(
    settingService as never,
    builderConfigService as never,
    systemSettingService as never,
    storagePlanService as never,
  )
  return { service, settingService, storagePlanService }
}

describe('photoStorageService storage mode', () => {
  it('resolves managed storage when managed is active and the tenant holds a storage plan', async () => {
    const { service } = createService({
      activeProvider: 'managed',
      storagePlan: { id: 'managed-5gb' },
      managedProvider: managedUpstream,
    })

    await expect(service.isManagedStorageActiveForTenant('tenant-1')).resolves.toBe(true)
    const { storageConfig } = await service.resolveConfigForTenant('tenant-1')
    expect(storageConfig).toMatchObject({ provider: 'managed', providerKey: 'managed-upstream', tenantId: 'tenant-1' })
  })

  it('falls back to the tenant provider when managed is selected without an active storage plan', async () => {
    const { service } = createService({ activeProvider: 'managed', storagePlan: null, tenantProvider: s3Provider })

    await expect(service.isManagedStorageActiveForTenant('tenant-1')).resolves.toBe(false)
    const { storageConfig } = await service.resolveConfigForTenant('tenant-1')
    expect(storageConfig.provider).toBe('s3')
  })

  it('reports BYO storage without looking up storage plans', async () => {
    const { service, storagePlanService } = createService({ activeProvider: 'my-s3', tenantProvider: s3Provider })

    await expect(service.isManagedStorageActiveForTenant('tenant-1')).resolves.toBe(false)
    expect(storagePlanService.getActivePlanSummaryForTenant).not.toHaveBeenCalled()
    const { storageConfig } = await service.resolveConfigForTenant('tenant-1')
    expect(storageConfig.provider).toBe('s3')
  })

  it('reports the storage mode even when the BYO provider config is incomplete', async () => {
    const { service, settingService } = createService({
      activeProvider: 'my-s3',
      tenantProvider: { ...s3Provider, config: { bucket: '', region: 'us-east-1' } },
    })

    await expect(service.isManagedStorageActiveForTenant('tenant-1')).resolves.toBe(false)
    expect(settingService.getActiveStorageProvider).not.toHaveBeenCalled()
    await expect(service.resolveConfigForTenant('tenant-1')).rejects.toThrow('missing `bucket`')
  })

  it('still refuses to resolve managed storage when the deployment has no managed provider', async () => {
    const { service } = createService({
      activeProvider: 'managed',
      storagePlan: { id: 'managed-5gb' },
      managedProvider: null,
    })

    await expect(service.isManagedStorageActiveForTenant('tenant-1')).resolves.toBe(true)
    await expect(service.resolveConfigForTenant('tenant-1')).rejects.toThrow('托管存储尚未启用')
  })
})
