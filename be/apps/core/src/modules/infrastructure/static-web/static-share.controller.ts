import { ContextParam, Controller, createZodSchemaDto, Get, Query } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'
import type { Context } from 'hono'
import { z } from 'zod'

import { StaticControllerUtils } from './static-controller.utils'
import { StaticDashboardService } from './static-dashboard.service'
import { STATIC_SHARE_ENTRY_PATH, StaticShareService } from './static-share.service'

const shareQuerySchema = z.object({
  id: z.string().min(1, 'Photo ID(s) required'),
})
class ShareQueryDto extends createZodSchemaDto(shareQuerySchema) {}

@Controller({ bypassGlobalPrefix: true })
export class StaticShareController {
  constructor(
    private readonly staticShareService: StaticShareService,
    private readonly staticDashboardService: StaticDashboardService,
  ) {}

  @Get('/share/iframe')
  async getStaticSharePage(@ContextParam() context: Context, @Query() query: ShareQueryDto) {
    if (StaticControllerUtils.isReservedTenant({ root: true })) {
      return await StaticControllerUtils.renderTenantRestrictedPage(this.staticDashboardService)
    }
    if (StaticControllerUtils.shouldRenderTenantMissingPage()) {
      return await StaticControllerUtils.renderTenantMissingPage(this.staticDashboardService)
    }

    const response = await this.staticShareService.handleRequest(STATIC_SHARE_ENTRY_PATH, false)

    if (!response || response.status === 404) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, {
        message: 'Share page not found',
      })
    }

    return await this.staticShareService.decorateSharePageResponse(context, query.id, response)
  }
}
