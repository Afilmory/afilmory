import { createHash } from 'node:crypto'

import { authAccounts, authSessions, authUsers, authVerifications, creemSubscriptions, generateId } from '@afilmory/db'
import { env } from '@afilmory/env'
import type { OnModuleInit } from '@afilmory/framework'
import { createLogger, HttpContext } from '@afilmory/framework'
import type { FlatSubscriptionEvent } from '@creem_io/better-auth'
import { creem } from '@creem_io/better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { DrizzleProvider } from 'core/database/database.provider'
import { BizException } from 'core/errors'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { BILLING_PLAN_IDS } from 'core/modules/platform/billing/billing-plan.constants'
import { BillingPlanService } from 'core/modules/platform/billing/billing-plan.service'
import type { BillingPlanId } from 'core/modules/platform/billing/billing-plan.types'
import { StoragePlanService } from 'core/modules/platform/billing/storage-plan.service'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { PLACEHOLDER_TENANT_SLUG } from '../tenant/tenant.constants'
import { TenantService } from '../tenant/tenant.service'
import { extractTenantSlugFromHost } from '../tenant/tenant-host.utils'
import type { AuthModuleOptions, SocialProviderOptions, SocialProvidersConfig } from './auth.config'
import { AuthConfig } from './auth.config'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

const logger = createLogger('Auth')

@injectable()
export class AuthProvider implements OnModuleInit {
  private instances = new Map<string, Promise<BetterAuthInstance>>()
  private placeholderTenantId: string | null = null

  constructor(
    private readonly config: AuthConfig,
    private readonly drizzleProvider: DrizzleProvider,
    private readonly systemSettings: SystemSettingService,
    private readonly tenantService: TenantService,
    private readonly billingPlanService: BillingPlanService,
    private readonly storagePlanService: StoragePlanService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.config.getOptions()
  }

  private resolveTenantIdFromContext(): string | null {
    try {
      const tenantContext = HttpContext.getValue('tenant') as { tenant?: { id?: string | null } } | undefined
      const tenantId = tenantContext?.tenant?.id
      return tenantId ?? null
    } catch {
      return null
    }
  }

  private resolveTenantSlugFromContext(): string | null {
    try {
      const tenantContext = HttpContext.getValue('tenant')
      const slug = tenantContext?.requestedSlug ?? tenantContext?.tenant?.slug
      return slug ? slug.toLowerCase() : null
    } catch {
      return null
    }
  }

  private buildCookiePrefix(tenantSlug: string | null): string {
    if (!tenantSlug) {
      return 'better-auth'
    }

    const sanitizedSlug = tenantSlug
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9_-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, '')

    return sanitizedSlug ? `better-auth-${sanitizedSlug}` : 'better-auth'
  }

  private async resolveFallbackTenantId(): Promise<string | null> {
    if (this.placeholderTenantId) {
      return this.placeholderTenantId
    }
    try {
      const placeholder = await this.tenantService.ensurePlaceholderTenant()
      this.placeholderTenantId = placeholder.tenant.id
      return this.placeholderTenantId
    } catch (error) {
      logger.error('Failed to ensure placeholder tenant', error)
      return null
    }
  }

  private resolveRequestEndpoint(): { host: string | null; protocol: string | null } {
    try {
      const hono = HttpContext.getValue('hono') as Context | undefined
      if (!hono) {
        return { host: null, protocol: null }
      }

      const forwardedHost = hono.req.header('x-forwarded-host')
      const forwardedProto = hono.req.header('x-forwarded-proto')
      const hostHeader = hono.req.header('host')

      return {
        host: (forwardedHost ?? hostHeader ?? '').trim() || null,
        protocol: (forwardedProto ?? '').trim() || null,
      }
    } catch {
      return { host: null, protocol: null }
    }
  }

  private determineProtocol(host: string, provided: string | null): string {
    if (provided && (provided === 'http' || provided === 'https')) {
      return provided
    }
    if (host.includes('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')) {
      return 'http'
    }
    return 'https'
  }

  private applyTenantSlugToHost(host: string, fallbackHost: string, tenantSlug: string | null): string {
    if (!tenantSlug) {
      return host
    }

    const [hostName, hostPort] = host.split(':') as [string, string?]
    if (hostName.startsWith(`${tenantSlug}.`)) {
      return host
    }

    const [fallbackName, fallbackPort] = fallbackHost.split(':') as [string, string?]
    if (hostName !== fallbackName) {
      return host
    }

    const portSegment = hostPort ?? fallbackPort
    return portSegment ? `${tenantSlug}.${fallbackName}:${portSegment}` : `${tenantSlug}.${fallbackName}`
  }

  private buildBetterAuthProvidersForHost(
    tenantSlug: string | null,
    providers: SocialProvidersConfig,
    oauthGatewayUrl: string | null,
  ): Record<string, { clientId: string; clientSecret: string; redirectUri?: string }> {
    const entries: Array<[keyof SocialProvidersConfig, SocialProviderOptions]> = Object.entries(providers).filter(
      (entry): entry is [keyof SocialProvidersConfig, SocialProviderOptions] => Boolean(entry[1]),
    )

    return entries.reduce<Record<string, { clientId: string; clientSecret: string; redirectURI?: string }>>(
      (acc, [key, value]) => {
        const redirectUri = this.buildRedirectUri(tenantSlug, key, oauthGatewayUrl)
        acc[key] = {
          clientId: value.clientId,
          clientSecret: value.clientSecret,
          ...(redirectUri ? { redirectURI: redirectUri } : {}),
        }
        return acc
      },
      {},
    )
  }

  private buildRedirectUri(
    tenantSlug: string | null,
    provider: keyof SocialProvidersConfig,
    oauthGatewayUrl: string | null,
  ): string | null {
    const basePath = `/api/auth/callback/${provider}`

    if (oauthGatewayUrl) {
      return this.buildGatewayRedirectUri(oauthGatewayUrl, basePath, tenantSlug)
    }
    logger.error(
      ['[AuthProvider] OAuth 网关地址未配置，无法为第三方登录生成回调 URL。', `provider=${String(provider)}`].join(' '),
    )
    return null
  }

  private buildGatewayRedirectUri(gatewayBaseUrl: string, basePath: string, tenantSlug: string | null): string {
    const normalizedBase = gatewayBaseUrl.replace(/\/+$/, '')
    const searchParams = new URLSearchParams()
    if (tenantSlug) {
      searchParams.set('tenantSlug', tenantSlug)
    }
    const query = searchParams.toString()
    return `${normalizedBase}${basePath}${query ? `?${query}` : ''}`
  }

  private async buildTrustedOrigins(): Promise<string[]> {
    if (env.NODE_ENV !== 'production') {
      return ['http://*.localhost:*', 'https://*.localhost:*', 'http://localhost:*', 'https://localhost:*']
    }

    const settings = await this.systemSettings.getSettings()
    return [
      `https://*.${settings.baseDomain}`,
      `http://*.${settings.baseDomain}`,
      `https://${settings.baseDomain}`,
      `http://${settings.baseDomain}`,
    ]
  }

  private async createAuthForEndpoint(
    tenantSlug: string | null,
    options: AuthModuleOptions,
  ): Promise<BetterAuthInstance> {
    const db = this.drizzleProvider.getDb()
    const socialProviders = this.buildBetterAuthProvidersForHost(
      tenantSlug,
      options.socialProviders,
      options.oauthGatewayUrl,
    )
    const cookiePrefix = this.buildCookiePrefix(tenantSlug)

    return betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: authUsers,
          session: authSessions,
          account: authAccounts,
          verification: authVerifications,
          subscription: creemSubscriptions,
        },
      }),
      socialProviders: socialProviders as any,
      emailAndPassword: { enabled: true },
      trustedOrigins: await this.buildTrustedOrigins(),
      session: {
        freshAge: 0,
      },
      user: {
        additionalFields: {
          tenantId: { type: 'string', input: false },
          role: { type: 'string', input: false },
          creemCustomerId: { type: 'string', input: false },
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              const tenantId = this.resolveTenantIdFromContext()
              if (tenantId) {
                return {
                  data: {
                    ...user,
                    tenantId,
                    role: user.role ?? 'guest',
                  },
                }
              }

              const fallbackTenantId = await this.resolveFallbackTenantId()
              if (!fallbackTenantId) {
                return { data: user }
              }

              return {
                data: {
                  ...user,
                  tenantId: fallbackTenantId,
                  role: user.role ?? 'guest',
                },
              }
            },
          },
        },
        session: {
          create: {
            before: async (session) => {
              const tenantId = this.resolveTenantIdFromContext()
              const fallbackTenantId = tenantId ?? session.tenantId ?? (await this.resolveFallbackTenantId())
              return {
                data: {
                  ...session,
                  tenantId: fallbackTenantId ?? null,
                },
              }
            },
          },
        },
        account: {
          create: {
            before: async (account) => {
              const tenantId = this.resolveTenantIdFromContext()
              const resolvedTenantId = tenantId ?? (await this.resolveFallbackTenantId())
              if (!resolvedTenantId) {
                return { data: account }
              }

              return {
                data: {
                  ...account,
                  tenantId: resolvedTenantId,
                },
              }
            },
          },
        },
      },
      advanced: {
        cookiePrefix,
        database: {
          generateId: () => generateId(),
        },
      },
      plugins: [
        admin({
          adminRoles: ['admin'],
          defaultRole: 'user',
          defaultBanReason: 'Spamming',
        }),
        creem({
          apiKey: env.CREEM_API_KEY,
          webhookSecret: env.CREEM_WEBHOOK_SECRET,
          persistSubscriptions: true,
          testMode: env.NODE_ENV !== 'production',
          onCheckoutCompleted: async (data) => {
            await this.handleCreemWebhook({
              event: data.webhookEventType,
              metadata: this.mergeMetadata(data.metadata, data.subscription?.metadata),
              status: data.subscription?.status ?? null,
              defaultGrant: true,
            })
          },
          // onRefundCreated: async (data: FlatRefundCreated) => {
          //   await this.handleCreemRefundCreated(data)
          // },
          onSubscriptionCanceled: async (data) => {
            await this.handleCreemSubscriptionEvent(data, true)
          },
          onSubscriptionExpired: async (data) => {
            await this.handleCreemSubscriptionEvent(data, true)
          },
          onSubscriptionUpdate: async (data) => {
            await this.handleCreemSubscriptionEvent(data, false)
          },
        }),
      ],
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path !== '/sign-up/email') {
            return
          }

          try {
            await this.systemSettings.ensureRegistrationAllowed()
          } catch (error) {
            if (error instanceof BizException) {
              throw new APIError('FORBIDDEN', {
                message: error.message,
              })
            }

            throw error
          }
        }),
      },
    })
  }

  async getAuth(): Promise<BetterAuthInstance> {
    const options = await this.config.getOptions()
    const endpoint = this.resolveRequestEndpoint()
    const fallbackHost = options.baseDomain.trim().toLowerCase()
    const requestedHost = (endpoint.host ?? fallbackHost).trim().toLowerCase()
    const tenantSlugFromContext = this.resolveTenantSlugFromContext()
    const tenantSlug =
      tenantSlugFromContext && tenantSlugFromContext !== PLACEHOLDER_TENANT_SLUG
        ? tenantSlugFromContext
        : (extractTenantSlugFromHost(requestedHost, options.baseDomain) ?? tenantSlugFromContext)
    const host = this.applyTenantSlugToHost(requestedHost || fallbackHost, fallbackHost, tenantSlug)
    const protocol = this.determineProtocol(host, endpoint.protocol)

    const optionSignature = this.computeOptionsSignature(options)
    const cacheKey = `${protocol}://${host}::${tenantSlug}::${optionSignature}`

    if (!this.instances.has(cacheKey)) {
      const instancePromise = this.createAuthForEndpoint(tenantSlug, options).then((instance) => {
        logger.info(`Better Auth initialized for ${cacheKey}`)
        return instance
      })
      this.instances.set(cacheKey, instancePromise)
    }

    return await this.instances.get(cacheKey)!
  }

  private computeOptionsSignature(options: AuthModuleOptions): string {
    const hash = createHash('sha256')
    hash.update(options.baseDomain)
    hash.update('|gateway=')
    hash.update(options.oauthGatewayUrl ?? 'null')

    const providerEntries = Object.entries(options.socialProviders)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, config]) => {
        const secretHash = config?.clientSecret
          ? createHash('sha256').update(config.clientSecret).digest('hex')
          : 'null'
        return {
          provider,
          clientId: config?.clientId ?? '',
          secretHash,
        }
      })

    hash.update(JSON.stringify(providerEntries))
    return hash.digest('hex')
  }

  private async handleCreemSubscriptionEvent(data: FlatSubscriptionEvent<string>, forceRevoke: boolean): Promise<void> {
    await this.handleCreemWebhook({
      event: data.webhookEventType,
      metadata: this.mergeMetadata(data.metadata),
      status: data.status,
      forceRevoke,
    })
  }

  private async handleCreemWebhook(params: {
    event: string
    metadata?: Record<string, unknown> | null
    status?: string | null
    defaultGrant?: boolean
    forceRevoke?: boolean
  }): Promise<void> {
    const { event, metadata, status, defaultGrant = false, forceRevoke = false } = params
    const tenantId = this.extractMetadataValue(metadata ?? undefined, 'tenantId')
    const planId = this.extractPlanIdFromMetadata(metadata ?? undefined)
    const storagePlanId = this.extractStoragePlanIdFromMetadata(metadata ?? undefined)

    if (!tenantId) {
      logger.warn(`[AuthProvider] Creem ${event} event missing tenantId metadata`)
      return
    }

    const shouldGrant = this.shouldGrantStatus(status, event, defaultGrant, forceRevoke)
    if (shouldGrant === null) {
      logger.warn(`[AuthProvider] Creem ${event} event for tenant ${tenantId} missing actionable status, skipping`)
      return
    }
    if (shouldGrant) {
      await this.applyPlanUpdates({ tenantId, planId, storagePlanId, event })
      return
    }

    await this.applyRevocation({ tenantId, planId, storagePlanId, event })
  }

  private mergeMetadata(...sources: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> | null {
    const merged = sources.filter(Boolean).reduce<Record<string, unknown>>((acc, curr) => {
      Object.assign(acc, curr as Record<string, unknown>)
      return acc
    }, {})
    return Object.keys(merged).length > 0 ? merged : null
  }

  private shouldGrantStatus(
    status: string | null | undefined,
    event: string,
    defaultGrant: boolean,
    forceRevoke: boolean,
  ): boolean | null {
    if (forceRevoke) {
      return false
    }
    const normalized = status?.toLowerCase() ?? null
    const grantStatuses = new Set(['active', 'trialing', 'paid'])

    if (event === 'checkout.completed') {
      return true
    }

    if (normalized && grantStatuses.has(normalized)) {
      return true
    }

    if (event === 'subscription.update') {
      if (!normalized) {
        return defaultGrant ? true : null
      }
      return grantStatuses.has(normalized)
    }

    if (!normalized && !defaultGrant) {
      return null
    }

    return defaultGrant
  }

  private async applyPlanUpdates(params: {
    tenantId: string
    planId: BillingPlanId | null
    storagePlanId: string | null
    event: string
  }): Promise<void> {
    const { tenantId, planId, storagePlanId, event } = params
    let handled = false

    if (planId) {
      handled = true
      try {
        await this.billingPlanService.updateTenantPlan(tenantId, planId)
        logger.info(`[AuthProvider] Tenant ${tenantId} set to billing plan ${planId} via Creem (${event})`)
      } catch (error) {
        logger.error(`[AuthProvider] Failed to update tenant ${tenantId} billing plan from Creem (${event})`, error)
      }
    }

    if (storagePlanId) {
      handled = true
      try {
        await this.storagePlanService.updateTenantPlan(tenantId, storagePlanId)
        logger.info(`[AuthProvider] Tenant ${tenantId} storage plan set to ${storagePlanId} via Creem (${event})`)
      } catch (error) {
        logger.error(`[AuthProvider] Failed to update tenant ${tenantId} storage plan from Creem (${event})`, error)
      }
    }

    if (!handled) {
      logger.warn(`[AuthProvider] Creem ${event} event for tenant ${tenantId} missing plan metadata`)
    }
  }

  private async applyRevocation(params: {
    tenantId: string
    planId: BillingPlanId | null
    storagePlanId: string | null
    event: string
  }): Promise<void> {
    const { tenantId, planId, storagePlanId, event } = params
    let handled = false

    if (planId) {
      handled = true
      try {
        await this.billingPlanService.updateTenantPlan(tenantId, 'free')
        logger.info(`[AuthProvider] Tenant ${tenantId} downgraded to free via Creem (${event})`)
      } catch (error) {
        logger.error(`[AuthProvider] Failed to downgrade tenant ${tenantId} after Creem ${event}`, error)
      }
    }

    if (storagePlanId) {
      handled = true
      try {
        await this.storagePlanService.updateTenantPlan(tenantId, null)
        logger.info(`[AuthProvider] Tenant ${tenantId} storage plan cleared via Creem (${event})`)
      } catch (error) {
        logger.error(`[AuthProvider] Failed to clear tenant ${tenantId} storage plan after Creem ${event}`, error)
      }
    }

    if (!handled) {
      logger.warn(`[AuthProvider] Creem ${event} event for tenant ${tenantId} missing plan metadata`)
    }
  }

  private extractPlanIdFromMetadata(metadata?: Record<string, unknown>): BillingPlanId | null {
    const planId = this.extractMetadataValue(metadata, 'planId')
    if (!planId) {
      return null
    }
    if (BILLING_PLAN_IDS.includes(planId as BillingPlanId)) {
      return planId as BillingPlanId
    }
    return null
  }

  private extractStoragePlanIdFromMetadata(metadata?: Record<string, unknown>): string | null {
    return this.extractMetadataValue(metadata, 'storagePlanId')
  }

  private extractMetadataValue(metadata: Record<string, unknown> | undefined, key: string): string | null {
    if (!metadata) {
      return null
    }
    const raw = metadata[key]
    if (typeof raw !== 'string') {
      return null
    }
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  async handler(context: Context): Promise<Response> {
    const requestPath = typeof context.req.path === 'string' ? context.req.path : new URL(context.req.url).pathname
    if (requestPath.startsWith('/api/auth/error')) {
      const error = context.req.query('error')
      const errorDescription = context.req.query('error_description')
      const provider = context.req.query('provider')
      const debugParts = [
        '[AuthProvider] OAuth callback error encountered.',
        error ? `error=${error}` : null,
        errorDescription ? `description=${errorDescription}` : null,
        provider ? `provider=${provider}` : null,
        `url=${context.req.url}`,
      ].filter(Boolean)
      logger.error(debugParts.join(' '))
    }
    const auth = await this.getAuth()
    return auth.handler(context.req.raw)
  }
}

export type AuthInstance = BetterAuthInstance
export type AuthSession = BetterAuthInstance['$Infer']['Session']
