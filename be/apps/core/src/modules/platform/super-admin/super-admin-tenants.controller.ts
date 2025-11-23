import { photoAssets } from '@afilmory/db'
import { Body, Controller, Get, Param, Patch, Query } from '@afilmory/framework'
import { DbAccessor } from 'core/database/database.provider'
import { Roles } from 'core/guards/roles.decorator'
import { BypassResponseTransform } from 'core/interceptors/response-transform.decorator'
import { BillingPlanService } from 'core/modules/platform/billing/billing-plan.service'
import { BillingUsageService } from 'core/modules/platform/billing/billing-usage.service'
import { TenantService } from 'core/modules/platform/tenant/tenant.service'
import { desc, eq } from 'drizzle-orm'

import type { BillingPlanId } from '../billing/billing-plan.types'
import { UpdateTenantBanDto, UpdateTenantPlanDto } from './super-admin.dto'

@Controller('super-admin/tenants')
@Roles('superadmin')
@BypassResponseTransform()
export class SuperAdminTenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly billingPlanService: BillingPlanService,
    private readonly billingUsageService: BillingUsageService,
    private readonly db: DbAccessor,
  ) {}

  @Get('/:tenantId/photos')
  async getTenantPhotos(@Param('tenantId') tenantId: string, @Query('limit') limit = '20') {
    const photos = await this.db
      .get()
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenantId))
      .limit(Number(limit))
      .orderBy(desc(photoAssets.createdAt))

    return {
      photos: photos.map((p) => ({
        ...p,
        publicUrl: p.manifest.data.thumbnailUrl,
      })),
    }
  }

  @Get('/')
  async listTenants() {
    const [tenantAggregates, plans] = await Promise.all([
      this.tenantService.listTenants(),
      Promise.resolve(this.billingPlanService.getPlanDefinitions()),
    ])

    const tenantIds = tenantAggregates.map((aggregate) => aggregate.tenant.id)
    const usageTotalsMap = await this.billingUsageService.getUsageTotalsForTenants(tenantIds)

    return {
      tenants: tenantAggregates.map((aggregate) => ({
        ...aggregate.tenant,
        usageTotals: usageTotalsMap[aggregate.tenant.id] ?? [],
      })),
      plans,
    }
  }

  @Patch('/:tenantId/plan')
  async updateTenantPlan(@Param('tenantId') tenantId: string, @Body() dto: UpdateTenantPlanDto) {
    await this.billingPlanService.updateTenantPlan(tenantId, dto.planId as BillingPlanId)
    return { updated: true }
  }

  @Patch('/:tenantId/ban')
  async updateTenantBan(@Param('tenantId') tenantId: string, @Body() dto: UpdateTenantBanDto) {
    await this.tenantService.setBanned(tenantId, dto.banned)
    return { updated: true }
  }
}
