import { photoAssets, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { PlatformRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { BillingEntitlementService } from '@core/modules/platform/billing/entitlement/billing-entitlement.service'
import { BillingPlanService } from '@core/modules/platform/billing/plan/billing-plan.service'
import { BillingUsageService } from '@core/modules/platform/billing/usage/billing-usage.service'
import { ManagedStorageService } from '@core/modules/platform/managed-storage/managed-storage.service'
import { TenantService } from '@core/modules/platform/tenant/tenant.service'
import { Body, Controller, Delete, Get, Param, Patch, Query } from '@tsuki-hono/common'
import { desc, eq } from 'drizzle-orm'

import type { BillingPlanId } from '../billing/plan/billing-plan.types'
import { DataManagementService } from '../data-management/data-management.service'
import {
  ListTenantsQueryDto,
  TenantIdParamDto,
  TenantPhotosQueryDto,
  UpdateTenantBanDto,
  UpdateTenantPlanDto,
  UpdateTenantStoragePlanDto,
} from './super-admin.dto'
import { SuperAdminAuditService } from './super-admin-audit.service'

@Controller('super-admin/tenants')
@PlatformRoles('superadmin')
@BypassResponseTransform()
export class SuperAdminTenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly dataManagementService: DataManagementService,
    private readonly billingPlanService: BillingPlanService,
    private readonly billingEntitlements: BillingEntitlementService,
    private readonly billingUsageService: BillingUsageService,
    private readonly managedStorageService: ManagedStorageService,
    private readonly systemSettings: SystemSettingService,
    private readonly db: DbAccessor,
    private readonly audit: SuperAdminAuditService,
  ) {}

  @Get('/:tenantId/photos')
  async getTenantPhotos(@Param() params: TenantIdParamDto, @Query() query: TenantPhotosQueryDto) {
    const photos = await this.db
      .get()
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, params.tenantId))
      .limit(query.limit)
      .orderBy(desc(photoAssets.createdAt))

    return {
      photos: photos.map(p => ({
        ...p,
        publicUrl: p.manifest.data.thumbnailUrl,
      })),
    }
  }

  @Get('/')
  async listTenants(@Query() query: ListTenantsQueryDto) {
    const [tenantResult, plans, storagePlanCatalog, managedProviderKey] = await Promise.all([
      this.tenantService.listTenants({
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      }),
      Promise.resolve(this.billingPlanService.getPlanDefinitions()),
      this.systemSettings.getStoragePlanCatalog(),
      this.systemSettings.getManagedStorageProviderKey(),
    ])

    const { items: tenantAggregates, total } = tenantResult

    const tenantIds = tenantAggregates.map(aggregate => aggregate.tenant.id)
    const usageTotalsMap = await this.billingUsageService.getUsageTotalsForTenants(tenantIds)
    const storageUsageMap
      = managedProviderKey && tenantIds.length > 0
        ? await this.managedStorageService.getUsageTotalsForTenants(managedProviderKey, tenantIds)
        : {}

    return {
      tenants: tenantAggregates.map(aggregate => ({
        ...aggregate.tenant,
        usageTotals: usageTotalsMap[aggregate.tenant.id] ?? [],
        storageUsage: storageUsageMap[aggregate.tenant.id] ?? null,
      })),
      plans,
      storagePlans: Object.entries(storagePlanCatalog).map(([id, def]) => ({
        id,
        ...def,
      })),
      total,
    }
  }

  @Get('/storage')
  async listStorageTenants(@Query() query: ListTenantsQueryDto) {
    const [tenantResult, storagePlanCatalog, managedProviderKey] = await Promise.all([
      this.tenantService.listTenants({
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
        requireStoragePlan: true,
      }),
      this.systemSettings.getStoragePlanCatalog(),
      this.systemSettings.getManagedStorageProviderKey(),
    ])

    const { items: tenantAggregates, total } = tenantResult
    const tenantIds = tenantAggregates.map(aggregate => aggregate.tenant.id)

    const storageUsageMap
      = managedProviderKey && tenantIds.length > 0
        ? await this.managedStorageService.getUsageTotalsForTenants(managedProviderKey, tenantIds)
        : {}

    return {
      tenants: tenantAggregates.map(aggregate => ({
        ...aggregate.tenant,
        storageUsage: storageUsageMap[aggregate.tenant.id] ?? null,
      })),
      plans: [],
      storagePlans: Object.entries(storagePlanCatalog).map(([id, def]) => ({
        id,
        ...def,
      })),
      total,
    }
  }

  @Patch('/:tenantId/plan')
  async updateTenantPlan(@Param() params: TenantIdParamDto, @Body() dto: UpdateTenantPlanDto) {
    const before = await this.getTenantAuditSnapshot(params.tenantId)
    return await this.audit.run(
      {
        action: 'tenant.plan.update',
        targetType: 'tenant',
        targetId: params.tenantId,
        before,
      },
      async () => {
        await this.billingEntitlements.setManualGrant({
          kind: 'application_plan',
          sourceId: `superadmin:${params.tenantId}`,
          tenantId: params.tenantId,
          value: dto.planId as BillingPlanId,
        })
        return { updated: true, planId: dto.planId }
      },
      result => ({ after: result }),
    )
  }

  @Patch('/:tenantId/storage-plan')
  async updateTenantStoragePlan(@Param() params: TenantIdParamDto, @Body() dto: UpdateTenantStoragePlanDto) {
    const before = await this.getTenantAuditSnapshot(params.tenantId)
    return await this.audit.run(
      {
        action: 'tenant.storage-plan.update',
        targetType: 'tenant',
        targetId: params.tenantId,
        before,
      },
      async () => {
        await this.billingEntitlements.setManualGrant({
          kind: 'managed_storage',
          sourceId: `superadmin:${params.tenantId}`,
          tenantId: params.tenantId,
          value: dto.storagePlanId,
        })
        return { updated: true, storagePlanId: dto.storagePlanId }
      },
      result => ({ after: result }),
    )
  }

  @Patch('/:tenantId/ban')
  async updateTenantBan(@Param() params: TenantIdParamDto, @Body() dto: UpdateTenantBanDto) {
    const before = await this.getTenantAuditSnapshot(params.tenantId)
    return await this.audit.run(
      {
        action: dto.banned ? 'tenant.ban' : 'tenant.unban',
        targetType: 'tenant',
        targetId: params.tenantId,
        before,
      },
      async () => {
        await this.tenantService.setBanned(params.tenantId, dto.banned)
        return { updated: true, banned: dto.banned }
      },
      result => ({ after: result }),
    )
  }

  @Delete('/:tenantId')
  async deleteTenant(@Param() params: TenantIdParamDto) {
    const before = await this.getTenantAuditSnapshot(params.tenantId)
    return await this.audit.run(
      {
        action: 'tenant.delete',
        targetType: 'tenant',
        targetId: params.tenantId,
        before,
      },
      async () => await this.dataManagementService.deleteTenantAccountById(params.tenantId),
      result => ({ after: result }),
    )
  }

  private async getTenantAuditSnapshot(tenantId: string) {
    const [tenant] = await this.db
      .get()
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        banned: tenants.banned,
        planId: tenants.planId,
        storagePlanId: tenants.storagePlanId,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    return tenant ?? null
  }
}
