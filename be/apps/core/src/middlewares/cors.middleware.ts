import type { HttpMiddleware, OnModuleDestroy, OnModuleInit } from '@afilmory/framework'
import { EventEmitterService, Middleware } from '@afilmory/framework'
import { logger } from 'core/helpers/logger.helper'
import { SettingService } from 'core/modules/configuration/setting/setting.service'
import { AppStateService } from 'core/modules/infrastructure/app-state/app-state.service'
import { getTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { TenantContextResolver } from 'core/modules/platform/tenant/tenant-context-resolver.service'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { injectable } from 'tsyringe'

type AllowedOrigins = '*' | string[]

function normalizeOriginValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '*') {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    return `${url.protocol}//${url.host}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function parseAllowedOrigins(raw: string | null): AllowedOrigins {
  if (!raw) {
    return '*'
  }

  const entries = raw
    .split(/[\n,]/)
    .map((value) => normalizeOriginValue(value))
    .filter((value) => value.length > 0)

  if (entries.length === 0 || entries.includes('*')) {
    return '*'
  }

  return Array.from(new Set(entries))
}

@Middleware()
@injectable()
export class CorsMiddleware implements HttpMiddleware, OnModuleInit, OnModuleDestroy {
  private readonly allowedOrigins = new Map<string, AllowedOrigins>()
  private readonly logger = logger.extend('CorsMiddleware')
  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly settingService: SettingService,
    private readonly tenantContextResolver: TenantContextResolver,
    private readonly appState: AppStateService,
  ) {}

  private readonly corsMiddleware = cors({
    origin: (origin) => this.resolveOrigin(origin),
    credentials: true,
  })

  private readonly handleSettingUpdated = ({ tenantId, key }: { tenantId: string; key: string }) => {
    if (key !== 'http.cors.allowedOrigins') {
      return
    }
    void this.reloadAllowedOrigins(tenantId)
  }

  private readonly handleSettingDeleted = ({ tenantId, key }: { tenantId: string; key: string }) => {
    if (key !== 'http.cors.allowedOrigins') {
      return
    }
    this.allowedOrigins.delete(tenantId)
  }

  async onModuleInit(): Promise<void> {
    this.eventEmitter.on('setting.updated', this.handleSettingUpdated)
    this.eventEmitter.on('setting.deleted', this.handleSettingDeleted)
  }

  async onModuleDestroy(): Promise<void> {
    this.eventEmitter.off('setting.updated', this.handleSettingUpdated)
    this.eventEmitter.off('setting.deleted', this.handleSettingDeleted)
  }

  private addAllCorsHeaders(context: Context): void {
    context.res.headers.set('Access-Control-Allow-Origin', context.req.header('Origin') ?? '*')
    context.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    context.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    context.res.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  private handleOptionsPreflight(context: Context): Response {
    const origin = context.req.header('Origin')

    if (origin) {
      context.res.headers.append('Vary', 'Origin')
    }

    // Align with typical CORS preflight behavior
    const requestHeaders = context.req.header('Access-Control-Request-Headers')
    if (requestHeaders) {
      context.res.headers.set('Access-Control-Allow-Headers', requestHeaders)
      context.res.headers.append('Vary', 'Access-Control-Request-Headers')
    }

    context.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    context.res.headers.set('Access-Control-Allow-Credentials', 'true')
    context.res.headers.set('Access-Control-Allow-Origin', origin ?? '*')

    // Ensure no body-related headers on 204
    context.res.headers.delete('Content-Length')
    context.res.headers.delete('Content-Type')

    return new Response(null, {
      headers: context.res.headers,
      status: 204,
      statusText: 'No Content',
    })
  }

  ['use']: HttpMiddleware['use'] = async (context, next) => {
    const initialized = await this.appState.isInitialized()

    if (!initialized) {
      this.logger.info(`Application not initialized yet, skip CORS middleware for ${context.req.path}`)
      if (context.req.method === 'OPTIONS') {
        return this.handleOptionsPreflight(context)
      }
      this.addAllCorsHeaders(context)
      return await next()
    }

    const tenantContext = await this.tenantContextResolver.resolve(context, {
      setResponseHeaders: false,
      skipInitializationCheck: true,
    })

    const tenantId = tenantContext?.tenant.id

    if (tenantId) {
      await this.ensureTenantOriginsLoaded(tenantId)
    } else {
      this.logger.warn(`Tenant context missing for request ${context.req.method} ${context.req.path}`)
    }

    return await this.corsMiddleware(context, next)
  }

  private async ensureTenantOriginsLoaded(tenantId: string): Promise<void> {
    if (this.allowedOrigins.has(tenantId)) {
      return
    }

    await this.reloadAllowedOrigins(tenantId)
  }

  private async reloadAllowedOrigins(tenantId: string): Promise<void> {
    let raw: string | null = null

    try {
      raw = await this.settingService.get('http.cors.allowedOrigins', { tenantId })
    } catch (error) {
      this.logger.warn('Failed to load CORS configuration from settings for tenant', tenantId, error)
    }

    this.updateAllowedOrigins(tenantId, raw)
  }

  private updateAllowedOrigins(tenantId: string, next: string | null): void {
    const parsed = parseAllowedOrigins(next)
    this.allowedOrigins.set(tenantId, parsed)
    this.logger.info('Updated CORS allowed origins for tenant', tenantId, parsed === '*' ? '*' : JSON.stringify(parsed))
  }

  private resolveOrigin(origin: string | undefined): string | null {
    if (!origin) {
      return null
    }

    const normalized = normalizeOriginValue(origin)

    if (!normalized) {
      return null
    }

    const tenantContext = getTenantContext()
    const tenantId = tenantContext?.tenant.id

    if (!tenantId) {
      return null
    }

    const allowed = this.allowedOrigins.get(tenantId)

    if (!allowed) {
      return null
    }

    if (allowed === '*') {
      return normalized
    }

    return allowed.includes(normalized) ? normalized : null
  }
}
