import { ContextParam, Controller, createZodSchemaDto, Get, Param, Query } from '@tsuki/framework'
import { AllowPlaceholderTenant } from 'core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from 'core/decorators/skip-tenant.decorator'
import type { Context } from 'hono'
import z from 'zod'

import { StaticBaseController } from './static-base.controller'
import { StaticControllerUtils } from './static-controller.utils'
import { StaticDashboardService } from './static-dashboard.service'
import { StaticWebService } from './static-web.service'
import devTemplate from './static-web-dev.template.html?raw'

class StaticWebDto extends createZodSchemaDto(
  z.object({
    dev: z.url().optional(),
  }),
) {}
@Controller({ bypassGlobalPrefix: true })
export class StaticWebController extends StaticBaseController {
  constructor(staticWebService: StaticWebService, staticDashboardService: StaticDashboardService) {
    super(staticWebService, staticDashboardService)
  }

  @Get('/')
  @Get('/explory')
  @SkipTenantGuard()
  @AllowPlaceholderTenant()
  async getStaticWebIndex(@ContextParam() context: Context, @Query() query: StaticWebDto) {
    if (query.dev) {
      return await this.serveDev(context, query.dev.toString())
    }

    const tenantStateResponse = await StaticControllerUtils.ensureTenantAvailable(this.staticDashboardService)
    if (tenantStateResponse) {
      return tenantStateResponse
    }

    const response = await this.serve(context, this.staticWebService, false)
    if (response.status === 404) {
      return await StaticControllerUtils.renderTenantMissingPage(this.staticDashboardService)
    }
    return await this.staticWebService.decorateHomepageResponse(context, response)
  }

  @Get('/photos/:photoId')
  async getStaticPhotoPage(@ContextParam() context: Context, @Param('photoId') photoId: string) {
    const tenantStateResponse = await StaticControllerUtils.ensureTenantAvailable(this.staticDashboardService)
    if (tenantStateResponse) {
      return tenantStateResponse
    }
    const response = await this.serve(context, this.staticWebService, false)
    if (response.status === 404) {
      return await StaticControllerUtils.renderTenantMissingPage(this.staticDashboardService)
    }
    return await this.staticWebService.decoratePhotoPageResponse(context, photoId, response)
  }

  private async serveDev(context: Context, devHost: string) {
    const template = devTemplate.replaceAll('{{host}}', devHost)
    const transformed = await this.staticWebService.transformIndexHtml(template, {
      absolutePath: '/',
      relativePath: '/',
      stats: {
        mtime: new Date(),
        size: template.length,
      },
    })
    return this.staticWebService.decorateHomepageResponse(
      context,
      new Response(transformed, {
        headers: {
          'Content-Type': 'text/html',
        },
      }),
    )
  }
}
