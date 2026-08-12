import { TenantRoles } from '@core/guards/roles.decorator'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { Controller, createZodSchemaDto, Get, Query } from '@tsuki-hono/common'
import { inject } from 'tsyringe'
import z from 'zod'

import { BillingOverviewService } from './overview/billing-overview.service'
import type { BillingOverview } from './overview/billing-overview.types'
import type { BillingPlanSummary } from './plan/billing-plan.service'
import { BillingPlanService } from './plan/billing-plan.service'
import { StoragePlanService } from './plan/storage-plan.service'
import type { BillingUsageOverview } from './usage/billing-usage.service'
import { BillingUsageService } from './usage/billing-usage.service'

const usageQuerySchema = z.object({
  limit: z.coerce.number().positive().int().optional().default(10),
})
class UsageQueryDto extends createZodSchemaDto(usageQuerySchema) {}

@Controller('billing')
@TenantRoles('owner')
export class BillingController {
  constructor(
    @inject(BillingUsageService) private readonly billingUsageService: BillingUsageService,
    @inject(BillingPlanService) private readonly billingPlanService: BillingPlanService,
    @inject(StoragePlanService) private readonly storagePlanService: StoragePlanService,
    @inject(BillingOverviewService) private readonly billingOverviewService: BillingOverviewService,
  ) {}

  @Get('overview')
  async getOverview(): Promise<BillingOverview> {
    return await this.billingOverviewService.getOverview(requireTenantContext().tenant.id)
  }

  @Get('usage')
  async getUsage(@Query() query: UsageQueryDto): Promise<BillingUsageOverview> {
    return await this.billingUsageService.getOverview({ limit: query.limit })
  }

  @Get('plan')
  async getCurrentPlan(): Promise<{ plan: BillingPlanSummary, availablePlans: BillingPlanSummary[] }> {
    const [plan, availablePlans] = await Promise.all([
      this.billingPlanService.getCurrentPlanSummary(),
      this.billingPlanService.getPublicPlanSummaries(),
    ])
    return { plan, availablePlans }
  }

  @Get('storage')
  async getStoragePlans() {
    return await this.storagePlanService.getOverviewForCurrentTenant()
  }
}
