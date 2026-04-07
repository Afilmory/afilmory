import { decodeGatewayState } from '@afilmory/be-utils'
import { env } from '@afilmory/env'
import { HttpContext } from '@tsuki/framework'
import { DEFAULT_BASE_DOMAIN, isTenantSlugReserved } from '@afilmory/utils'
import { BizException, ErrorCode } from 'core/errors'
import { logger } from 'core/helpers/logger.helper'
import { AppStateService } from 'core/modules/app/app-state/app-state.service'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { ROOT_TENANT_SLUG } from './tenant.constants'
import { TenantService } from './tenant.service'
import type { TenantAggregate, TenantContext } from './tenant.types'
import { TenantDomainService } from './tenant-domain.service'
import { extractTenantSlugFromHost } from './tenant-host.utils'

const ROOT_TENANT_PATH_PREFIXES = [
  '/api/super-admin',
  '/api/settings',
  '/api/storage/settings',
  '/api/builder/settings',
] as const

export interface TenantResolutionOptions {
  throwOnMissing?: boolean
  skipInitializationCheck?: boolean
}

@injectable()
export class TenantContextResolver {
  private readonly log = logger.extend('TenantResolver')
  private readonly gatewayStateSecret = env.AUTH_GATEWAY_STATE_SECRET ?? env.CONFIG_ENCRYPTION_KEY

  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantDomainService: TenantDomainService,
    private readonly appState: AppStateService,
    private readonly systemSettingService: SystemSettingService,
  ) {}

  async resolve(context: Context, options: TenantResolutionOptions = {}): Promise<TenantContext | null> {
    const existing = this.getExistingContext()
    if (existing) {
      return existing
    }

    if (!options.skipInitializationCheck) {
      const initialized = await this.appState.isInitialized()
      if (!initialized) {
        this.log.info(`Application not initialized yet, skip tenant resolution for ${context.req.path}`)
        return null
      }
    }

    const forwardedHost = context.req.header('x-forwarded-host')
    const origin = context.req.header('origin')
    const hostHeader = context.req.header('host')
    const host = this.normalizeHost(forwardedHost ?? hostHeader ?? null, origin)

    this.log.debug(`Forwarded host: ${forwardedHost}, Host header: ${hostHeader}, Origin: ${origin}, Host: ${host}`)

    const baseDomain = await this.getBaseDomain()
    let derivedSlug: string | undefined
    let tenantContext: TenantContext | null = null

    if (host) {
      const domainMatch = await this.tenantDomainService.resolveTenantByDomain(host)
      if (domainMatch) {
        tenantContext = this.asTenantContext(domainMatch, domainMatch.tenant.slug)
        derivedSlug = domainMatch.tenant.slug
        this.log.verbose(
          `Resolved tenant by custom domain for request ${context.req.method} ${context.req.path} (host=${host})`,
        )
      }
    }

    if (!derivedSlug) {
      derivedSlug = host ? (extractTenantSlugFromHost(host, baseDomain) ?? undefined) : undefined
    }
    if (
      !derivedSlug &&
      this.gatewayStateSecret &&
      context.req.path.startsWith('/api/auth/callback/') &&
      context.req.query
    ) {
      const gatewayState = context.req.query('gatewayState')
      const state = context.req.query('state')
      const decoded =
        decodeGatewayState(gatewayState, { secret: this.gatewayStateSecret }) ||
        decodeGatewayState(state, { secret: this.gatewayStateSecret })

      if (decoded?.tenantSlug) {
        derivedSlug = decoded.tenantSlug
        this.log.verbose('Resolved tenant from gateway state during OAuth callback', { slug: derivedSlug })
      }
    }
    if (!derivedSlug && this.isRootTenantPath(context.req.path)) {
      derivedSlug = ROOT_TENANT_SLUG
    }

    const requestedSlug = derivedSlug ?? null
    this.log.verbose(
      `Resolve tenant for request ${context.req.method} ${context.req.path} (host=${host ?? 'n/a'}, slug=${derivedSlug ?? 'n/a'})`,
    )

    if (!tenantContext && derivedSlug) {
      tenantContext = await this.tenantService.resolve(
        {
          slug: derivedSlug,
        },
        { noThrow: true, allowPending: true },
      )
    }

    if (!tenantContext && this.shouldAutoProvisionTenant(derivedSlug, context.req.path)) {
      const pendingSlug = derivedSlug as string
      const pending = await this.tenantService.ensurePendingTenant(pendingSlug)
      tenantContext = this.asTenantContext(pending, requestedSlug)
      this.log.verbose(
        `Provisioned pending tenant context for ${context.req.method} ${context.req.path} (host=${host ?? 'n/a'})`,
      )
    } else if (tenantContext) {
      tenantContext = {
        tenant: tenantContext.tenant,
        isPlaceholder: tenantContext.tenant.status !== 'active',
        requestedSlug: requestedSlug ?? tenantContext.tenant.slug ?? null,
      }
    }

    if (!tenantContext) {
      if (options.throwOnMissing && derivedSlug) {
        throw new BizException(ErrorCode.TENANT_NOT_FOUND)
      }
      return null
    }

    return tenantContext
  }

  private isRootTenantPath(path: string | undefined): boolean {
    if (!path) {
      return false
    }
    const normalizedPath = path.toLowerCase()
    return ROOT_TENANT_PATH_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix.toLowerCase()}/`),
    )
  }

  private getExistingContext(): TenantContext | null {
    try {
      return (HttpContext.getValue('tenant') as TenantContext | undefined) ?? null
    } catch {
      return null
    }
  }

  private async getBaseDomain(): Promise<string> {
    if (process.env.NODE_ENV === 'development') {
      return 'localhost'
    }
    const settings = await this.systemSettingService.getSettings()
    return settings.baseDomain || DEFAULT_BASE_DOMAIN
  }

  private normalizeHost(host: string | null | undefined, origin: string | null | undefined): string | null {
    const source = host ?? this.extractHostFromOrigin(origin)
    if (!source) {
      return null
    }

    const value = source.split(',', 1)[0]?.trim()
    if (!value) {
      return null
    }

    const withoutProtocol = value.replace(/^https?:\/\//, '')
    const [hostname] = withoutProtocol.split('/', 1)
    const [hostWithoutPort] = hostname.split(':', 1)

    const normalized = hostWithoutPort.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
  }

  private extractHostFromOrigin(origin: string | null | undefined): string | null {
    if (!origin) {
      return null
    }

    try {
      const url = new URL(origin)
      return url.host
    } catch {
      return null
    }
  }

  private shouldAutoProvisionTenant(slug: string | null | undefined, path: string): boolean {
    if (!slug || isTenantSlugReserved(slug)) {
      return false
    }
    const normalizedPath = path?.trim() || ''
    if (!normalizedPath) {
      return false
    }
    if (normalizedPath === '/auth' || normalizedPath === '/auth/') {
      return true
    }
    if (normalizedPath.startsWith('/auth/')) {
      return true
    }
    if (normalizedPath === '/api/auth' || normalizedPath === '/api/auth/') {
      return true
    }
    if (normalizedPath.startsWith('/api/auth/')) {
      return true
    }
    return false
  }

  private asTenantContext(source: TenantAggregate, requestedSlug: string | null): TenantContext {
    return {
      tenant: source.tenant,
      isPlaceholder: source.tenant.status !== 'active',
      requestedSlug,
    }
  }
}
