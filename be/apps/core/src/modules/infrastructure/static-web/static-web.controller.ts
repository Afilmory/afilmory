import { ContextParam, Controller, Get, Param } from '@afilmory/framework'
import { SkipTenant } from 'core/decorators/skip-tenant.decorator'
import type { Context } from 'hono'

import type { StaticAssetService } from './static-asset.service'
import { STATIC_DASHBOARD_BASENAME, StaticDashboardService } from './static-dashboard.service'
import { StaticWebService } from './static-web.service'

@Controller({ bypassGlobalPrefix: true })
export class StaticWebController {
  constructor(
    private readonly staticWebService: StaticWebService,
    private readonly staticDashboardService: StaticDashboardService,
  ) {}

  @Get('/static/web')
  @Get('/static/dashboard')
  async getStaticWebRoot(@ContextParam() context: Context) {
    return await this.serve(context, this.staticWebService, false)
  }

  @Get(`/`)
  @Get(`/explory`)
  async getStaticWebIndex(@ContextParam() context: Context) {
    return await this.serve(context, this.staticWebService, false)
  }

  @Get(`/photos/:photoId`)
  async getStaticPhotoPage(@ContextParam() context: Context, @Param('photoId') photoId: string) {
    const response = await this.serve(context, this.staticWebService, false)
    return await this.staticWebService.decoratePhotoPageResponse(context, photoId, response)
  }

  @Get(`${STATIC_DASHBOARD_BASENAME}`)
  @Get(`${STATIC_DASHBOARD_BASENAME}/*`)
  async getStaticDashboardIndexWithBasename(@ContextParam() context: Context) {
    return await this.serve(context, this.staticDashboardService, false)
  }

  @SkipTenant()
  @Get('/*')
  async getAsset(@ContextParam() context: Context) {
    return await this.handleRequest(context, false)
  }

  private async handleRequest(context: Context, headOnly: boolean): Promise<Response> {
    const service = this.resolveService(context.req.path)
    return await this.serve(context, service, headOnly)
  }

  private async serve(context: Context, service: StaticAssetService, headOnly: boolean): Promise<Response> {
    const pathname = context.req.path
    const normalizedPath = this.normalizeRequestPath(pathname, service)
    const response = await service.handleRequest(normalizedPath, headOnly)
    if (response) {
      return response
    }

    return headOnly ? new Response(null, { status: 404 }) : new Response('Not Found', { status: 404 })
  }

  private resolveService(pathname: string): StaticAssetService {
    if (this.isDashboardPath(pathname)) {
      return this.staticDashboardService
    }

    return this.staticWebService
  }

  private normalizeRequestPath(pathname: string, service: StaticAssetService): string {
    if (service !== this.staticDashboardService) {
      return pathname
    }

    if (this.isDashboardBasename(pathname)) {
      return pathname
    }

    if (this.isLegacyDashboardPath(pathname)) {
      return pathname.replace(/^\/static\/dashboard/, STATIC_DASHBOARD_BASENAME)
    }

    return pathname
  }

  private isDashboardPath(pathname: string): boolean {
    return this.isDashboardBasename(pathname) || this.isLegacyDashboardPath(pathname)
  }

  private isDashboardBasename(pathname: string): boolean {
    return pathname === STATIC_DASHBOARD_BASENAME || pathname.startsWith(`${STATIC_DASHBOARD_BASENAME}/`)
  }

  private isLegacyDashboardPath(pathname: string): boolean {
    return pathname === '/static/dashboard' || pathname.startsWith('/static/dashboard/')
  }
}
