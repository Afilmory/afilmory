import type { Context } from 'hono'

import type { StaticAssetService } from './static-asset.service'
import type { StaticDashboardService } from './static-dashboard.service'
import { STATIC_DASHBOARD_BASENAME } from './static-dashboard.service'
import type { StaticWebService } from './static-web.service'

export abstract class StaticBaseController {
  constructor(
    protected readonly staticWebService: StaticWebService,
    protected readonly staticDashboardService: StaticDashboardService,
  ) {}

  protected async handleAssetRequest(context: Context, headOnly: boolean): Promise<Response> {
    const service = this.resolveService(context.req.path)
    return await this.serve(context, service, headOnly)
  }

  protected async serve(context: Context, service: StaticAssetService, headOnly: boolean): Promise<Response> {
    const pathname = context.req.path
    const normalizedPath = this.normalizeRequestPath(pathname, service)
    const response = await service.handleRequest(normalizedPath, headOnly)

    if (response) {
      return response
    }

    return headOnly ? new Response(null, { status: 404 }) : new Response('Not Found', { status: 404 })
  }

  protected resolveService(pathname: string): StaticAssetService {
    if (this.isDashboardPath(pathname)) {
      return this.staticDashboardService
    }

    return this.staticWebService
  }

  protected normalizeRequestPath(pathname: string, service: StaticAssetService): string {
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

  protected isDashboardPath(pathname: string): boolean {
    return this.isDashboardBasename(pathname) || this.isLegacyDashboardPath(pathname)
  }

  protected isDashboardBasename(pathname: string): boolean {
    return pathname === STATIC_DASHBOARD_BASENAME || pathname.startsWith(`${STATIC_DASHBOARD_BASENAME}/`)
  }

  protected isLegacyDashboardPath(pathname: string): boolean {
    return pathname === '/static/dashboard' || pathname.startsWith('/static/dashboard/')
  }

  protected isHtmlRoute(pathname: string): boolean {
    if (!pathname) {
      return true
    }

    const normalized = pathname.split('?')[0]?.trim() ?? ''
    if (!normalized || normalized === '/' || normalized.endsWith('/')) {
      return true
    }

    const lastSegment = normalized.split('/').pop()
    if (!lastSegment) {
      return true
    }

    if (lastSegment.endsWith('.html')) {
      return true
    }

    return !lastSegment.includes('.')
  }

  protected shouldAllowTenantlessDashboardAccess(pathname: string): boolean {
    const normalized = this.normalizePathname(pathname)
    const welcomePath = `${STATIC_DASHBOARD_BASENAME}/welcome`
    return normalized === welcomePath
  }

  protected normalizePathname(pathname: string): string {
    if (!pathname) {
      return '/'
    }
    const [rawPath] = pathname.split('?')
    if (!rawPath) {
      return '/'
    }
    const trimmed = rawPath.trim()
    if (!trimmed) {
      return '/'
    }
    if (trimmed.length > 1 && trimmed.endsWith('/')) {
      return trimmed.replace(/\/+$/, '')
    }
    return trimmed
  }
}
