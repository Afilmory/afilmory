import { PlatformRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Body, Controller, Delete, Get, Param, Post, Query } from '@tsuki-hono/common'

import { CleanupCandidatesQueryDto, CleanupItemParamDto, ExecuteTenantCleanupDto } from './super-admin.dto'
import { SuperAdminCleanupService } from './super-admin-cleanup.service'

@Controller('super-admin/tenant-cleanup')
@PlatformRoles('superadmin')
@BypassResponseTransform()
export class SuperAdminCleanupController {
  constructor(private readonly cleanup: SuperAdminCleanupService) {}

  @Get('/candidates')
  async candidates(@Query() query: CleanupCandidatesQueryDto) {
    const { subjectType, ...criteria } = query
    return await this.cleanup.preview(subjectType, criteria)
  }

  @Get('/pending')
  async pending() {
    return { items: await this.cleanup.listPending() }
  }

  @Delete('/pending/:itemId')
  async cancelPending(@Param() params: CleanupItemParamDto) {
    await this.cleanup.cancelPending(params.itemId)
    return { cancelled: true }
  }

  @Post('/batches')
  async execute(@Body() body: ExecuteTenantCleanupDto) {
    return await this.cleanup.execute(body)
  }

  @Get('/batches')
  async batches() {
    return { batches: await this.cleanup.listBatches() }
  }

  @Get('/batches/:batchId')
  async batch(@Param('batchId') batchId: string) {
    return await this.cleanup.getBatch(batchId)
  }
}
