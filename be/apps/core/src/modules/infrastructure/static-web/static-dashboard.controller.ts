import { ContextParam, Controller, Get } from '@tsuki/framework'
import { AllowPlaceholderTenant } from 'core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from 'core/decorators/skip-tenant.decorator'
import type { Context } from 'hono'

import { StaticBaseController } from './static-base.controller'
import { StaticControllerUtils } from './static-controller.utils'
import { STATIC_DASHBOARD_BASENAME, StaticDashboardService } from './static-dashboard.service'
import { StaticWebService } from './static-web.service'

@Controller({ bypassGlobalPrefix: true })
export class StaticDashboardController extends StaticBaseController {
  constructor(staticWebService: StaticWebService, staticDashboardService: StaticDashboardService) {
    super(staticWebService, staticDashboardService)
  }

  @SkipTenantGuard()
  @AllowPlaceholderTenant()
  @Get(`${STATIC_DASHBOARD_BASENAME}`)
  @Get(`${STATIC_DASHBOARD_BASENAME}/*`)
  async getStaticDashboardIndexWithBasename(@ContextParam() context: Context) {
    const pathname = context.req.path
    const isHtmlRoute = this.isHtmlRoute(pathname)

    const allowTenantlessAccess = isHtmlRoute && this.shouldAllowTenantlessDashboardAccess(pathname)

    const isReservedTenant = StaticControllerUtils.isReservedTenant({ root: false })

    if (isHtmlRoute) {
      if (isReservedTenant) {
        return await StaticControllerUtils.renderTenantRestrictedPage(this.staticDashboardService)
      }
      if (!allowTenantlessAccess && StaticControllerUtils.shouldRenderTenantMissingPage()) {
        return await StaticControllerUtils.renderTenantMissingPage(this.staticDashboardService)
      }
    }

    return await this.serve(context, this.staticDashboardService, false)
  }
}
