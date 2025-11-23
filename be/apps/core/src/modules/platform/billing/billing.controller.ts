import { Controller, createZodSchemaDto, Get, Query } from '@afilmory/framework'
import { Roles } from 'core/guards/roles.decorator'
import { inject } from 'tsyringe'
import z from 'zod'

import type { BillingPlanSummary } from './billing-plan.service'
import { BillingPlanService } from './billing-plan.service'
import type { BillingUsageOverview } from './billing-usage.service'
import { BillingUsageService } from './billing-usage.service'
import { StoragePlanService } from './storage-plan.service'

const usageQuerySchema = z.object({
  limit: z.coerce.number().positive().int().optional().default(10),
})
class UsageQueryDto extends createZodSchemaDto(usageQuerySchema) {}

@Controller('billing')
@Roles('admin')
export class BillingController {
  constructor(
    @inject(BillingUsageService) private readonly billingUsageService: BillingUsageService,
    @inject(BillingPlanService) private readonly billingPlanService: BillingPlanService,
    @inject(StoragePlanService) private readonly storagePlanService: StoragePlanService,
  ) {}

  @Get('usage')
  async getUsage(@Query() query: UsageQueryDto): Promise<BillingUsageOverview> {
    return await this.billingUsageService.getOverview({ limit: query.limit })
  }

  @Get('plan')
  async getCurrentPlan(): Promise<{ plan: BillingPlanSummary; availablePlans: BillingPlanSummary[] }> {
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
