import type { ManagedStorageConfig, RemoteStorageConfig } from '@afilmory/builder'
import { StorageManager } from '@afilmory/builder/storage/index.js'
import {
  authSessions,
  commentReactions,
  comments,
  photoAssets,
  reactions,
  settings,
  tenantDomains,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { PhotoStorageService } from '@core/modules/content/photo/storage/photo-storage.service'
import { BILLING_USAGE_EVENT } from '@core/modules/platform/billing/billing.constants'
import { BillingUsageService } from '@core/modules/platform/billing/billing-usage.service'
import { ROOT_TENANT_SLUG } from '@core/modules/platform/tenant/tenant.constants'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

@injectable()
export class DataManagementService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly eventEmitter: EventEmitterService,
    private readonly billingUsageService: BillingUsageService,
    private readonly systemSettingService: SystemSettingService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  async clearPhotoAssetRecords(): Promise<{ deleted: number }> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()

    const deletedRecords = await db
      .delete(photoAssets)
      .where(eq(photoAssets.tenantId, tenant.tenant.id))
      .returning({ id: photoAssets.id })

    if (deletedRecords.length > 0) {
      await this.eventEmitter.emit('photo.manifest.changed', { tenantId: tenant.tenant.id })
      await this.billingUsageService.recordEvent({
        eventType: BILLING_USAGE_EVENT.PHOTO_ASSET_DELETED,
        quantity: -deletedRecords.length,
        metadata: {
          count: deletedRecords.length,
          source: 'tenant-management.clear-photo-assets',
        },
      })
    }

    return {
      deleted: deletedRecords.length,
    }
  }

  async deleteTenantAccount(): Promise<{ deletedTenantId: string }> {
    const tenant = requireTenantContext()
    const tenantId = tenant.tenant.id

    await this.deleteTenantWithMetadata({
      tenantId,
      tenantSlug: tenant.tenant.slug,
      status: tenant.tenant.status,
    })

    return { deletedTenantId: tenantId }
  }

  async deleteTenantAccountById(tenantId: string): Promise<{ deletedTenantId: string }> {
    const db = this.dbAccessor.get()
    const [record] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)

    if (!record) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    await this.deleteTenantWithMetadata({
      tenantId,
      tenantSlug: record.slug,
      status: record.status,
    })

    return { deletedTenantId: tenantId }
  }

  async deleteManagedStorageForTenantId(tenantId: string): Promise<void> {
    const managedConfig = await this.buildManagedStorageConfig(tenantId)

    if (!managedConfig) {
      return
    }

    const storageManager = new StorageManager(managedConfig)
    await storageManager.deleteFolder('')
  }

  private async buildManagedStorageConfig(tenantId: string): Promise<ManagedStorageConfig | null> {
    const provider = await this.systemSettingService.getManagedStorageProvider()
    if (!provider) {
      return null
    }

    const upstream = this.photoStorageService.mapProviderToStorageConfig(provider)

    return {
      provider: 'managed',
      tenantId,
      providerKey: provider.id,
      basePrefix: null,
      upstream: upstream as RemoteStorageConfig,
    }
  }

  private assertTenantDeletable(tenantSlug: string | null, status: string): void {
    if (!tenantSlug) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '当前租户缺少 slug，无法删除账户。',
      })
    }

    if (tenantSlug === ROOT_TENANT_SLUG || status === 'pending') {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '系统租户或未完成初始化的工作区无法通过此操作删除。',
      })
    }
  }

  private async deleteTenantWithMetadata(options: { tenantId: string, tenantSlug: string | null, status: string }) {
    this.assertTenantDeletable(options.tenantSlug, options.status)

    await this.deleteManagedStorageForTenantId(options.tenantId)

    const db = this.dbAccessor.get()

    await db.transaction(async (tx) => {
      await tx.delete(photoAssets).where(eq(photoAssets.tenantId, options.tenantId))
      await tx.delete(reactions).where(eq(reactions.tenantId, options.tenantId))
      await tx.delete(settings).where(eq(settings.tenantId, options.tenantId))
      await tx.delete(tenantDomains).where(eq(tenantDomains.tenantId, options.tenantId))

      await tx.delete(comments).where(eq(comments.tenantId, options.tenantId))
      await tx.delete(commentReactions).where(eq(commentReactions.tenantId, options.tenantId))

      await tx
        .update(authSessions)
        .set({ activeTenantId: null, updatedAt: new Date().toISOString() })
        .where(eq(authSessions.activeTenantId, options.tenantId))
      await tx.delete(tenantMemberships).where(eq(tenantMemberships.tenantId, options.tenantId))
      await tx.delete(tenants).where(eq(tenants.id, options.tenantId))
    })
  }
}
