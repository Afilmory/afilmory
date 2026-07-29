import { createHash } from 'node:crypto'

import { authAccounts, authSessions, authUsers, authVerifications, creemSubscriptions, generateId } from '@afilmory/db'
import { env } from '@afilmory/env'
import { expo } from '@better-auth/expo'
import { DrizzleProvider } from '@core/database/database.provider'
import { BizException } from '@core/errors'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { BILLING_PLAN_IDS } from '@core/modules/platform/billing/billing-plan.constants'
import { BillingPlanService } from '@core/modules/platform/billing/billing-plan.service'
import type { BillingPlanId } from '@core/modules/platform/billing/billing-plan.types'
import { StoragePlanService } from '@core/modules/platform/billing/storage-plan.service'
import type { FlatSubscriptionEvent } from '@creem_io/better-auth'
import { creem } from '@creem_io/better-auth'
import type { OnModuleInit } from '@tsuki-hono/common'
import { createLogger, HttpContext } from '@tsuki-hono/common'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { TenantService } from '../tenant/tenant.service'
import { extractTenantSlugFromHost } from '../tenant/tenant-host.utils'
import type { AuthModuleOptions, SocialProviderOptions, SocialProvidersConfig } from './auth.config'
import { AuthConfig } from './auth.config'
import { brokerDrizzleAdapter } from './broker-adapter'
import { tenantAwareDrizzleAdapter } from './tenant-aware-adapter'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

const logger = createLogger('Auth')
const TRAILING_SLASHES_PATTERN = /\/+$/

// The reserved `api` slug never resolves to a tenant, which makes its host the
// natural home for the mobile login broker: OAuth completes there, the provider
// identity is matched globally, and a session for the matched tenant is issued.
export const MOBILE_AUTH_BROKER_SLUG = 'api'

@injectable()
export class AuthProvider implements OnModuleInit {
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
    }
    catch {
      return null
    }
  }

  private resolveTenantSlugFromContext(): string | null {
    try {
      const tenantContext = HttpContext.getValue('tenant')
      const slug = tenantContext?.requestedSlug ?? tenantContext?.tenant?.slug
      return slug ? slug.toLowerCase() : null
    }
    catch {
      return null
    }
  }

  private async resolveTenantIdOrProvision(tenantSlug: string | null): Promise<string | null> {
    const tenantIdFromContext = this.resolveTenantIdFromContext()
    if (tenantIdFromContext) {
      return tenantIdFromContext
    }
    if (!tenantSlug) {
      return null
    }

    try {
      const aggregate = await this.tenantService.ensurePendingTenant(tenantSlug)
      return aggregate.tenant.id
    }
    catch (error) {
      logger.error(`Failed to provision tenant for slug=${tenantSlug}`, error)
      return null
    }
  }

  private resolveRequestEndpoint(): { host: string | null, protocol: string | null } {
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
    }
    catch {
      return { host: null, protocol: null }
    }
  }

  private buildBetterAuthProvidersForHost(
    providers: SocialProvidersConfig,
    oauthGatewayUrl: string | null,
  ): Record<string, { clientId: string, clientSecret: string, redirectUri?: string }> {
    const entries: Array<[keyof SocialProvidersConfig, SocialProviderOptions]> = Object.entries(providers).filter(
      (entry): entry is [keyof SocialProvidersConfig, SocialProviderOptions] => Boolean(entry[1]),
    )

    return entries.reduce<Record<string, { clientId: string, clientSecret: string, redirectURI?: string }>>(
      (acc, [key, value]) => {
        const redirectUri = this.buildRedirectUri(key, oauthGatewayUrl)
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

  private buildRedirectUri(provider: keyof SocialProvidersConfig, oauthGatewayUrl: string | null): string | null {
    const basePath = `/api/auth/callback/${provider}`

    if (oauthGatewayUrl) {
      return this.buildGatewayRedirectUri(oauthGatewayUrl, basePath)
    }
    logger.error(
      ['[AuthProvider] OAuth 网关地址未配置，无法为第三方登录生成回调 URL。', `provider=${String(provider)}`].join(' '),
    )
    return null
  }

  private buildGatewayRedirectUri(gatewayBaseUrl: string, basePath: string): string {
    const normalizedBase = gatewayBaseUrl.replace(TRAILING_SLASHES_PATTERN, '')
    return `${normalizedBase}${basePath}`
  }

  private async buildTrustedOrigins(): Promise<string[]> {
    const mobileOrigins = ['afilmory://']

    if (env.NODE_ENV !== 'production') {
      return [
        'http://*.localhost:*',
        'https://*.localhost:*',
        'http://localhost:*',
        'https://localhost:*',
        ...mobileOrigins,
      ]
    }

    const settings = await this.systemSettings.getSettings()
    return [
      `https://*.${settings.baseDomain}`,
      `http://*.${settings.baseDomain}`,
      `https://${settings.baseDomain}`,
      `http://${settings.baseDomain}`,
      ...mobileOrigins,
    ]
  }

  private async createAuthForEndpoint(
    tenantSlug: string | null,
    options: AuthModuleOptions,
    explicitTenantId?: string | null,
  ): Promise<BetterAuthInstance> {
    const db = this.drizzleProvider.getDb()
    const socialProviders = this.buildBetterAuthProvidersForHost(options.socialProviders, options.oauthGatewayUrl)

    // Use tenant-aware adapter for multi-tenant user/account isolation
    // This ensures that user lookups (by email) and account lookups (by provider)
    // are scoped to the current tenant, allowing the same email/social account
    // to exist as different users in different tenants
    const ensureTenantId = async () => {
      if (explicitTenantId) {
        return explicitTenantId
      }
      return await this.resolveTenantIdOrProvision(tenantSlug)
    }

    return betterAuth({
      database: tenantAwareDrizzleAdapter(
        db,
        {
          provider: 'pg',
          schema: {
            user: authUsers,
            session: authSessions,
            account: authAccounts,
            verification: authVerifications,
            subscription: creemSubscriptions,
          },
        },
        ensureTenantId,
      ),
      socialProviders: socialProviders as any,
      emailAndPassword: { enabled: true },
      trustedOrigins: await this.buildTrustedOrigins(),
      session: {
        freshAge: 0,
        additionalFields: {
          tenantId: { type: 'string', input: false },
        },
      },
      account: {
        // The OAuth gateway forwards the callback across a cross-subdomain
        // redirect hop (auth.<domain> -> <tenant>.<domain>), which real
        // browsers can drop the auth-state cookie on depending on SameSite
        // enforcement. The gateway's HMAC-signed state envelope plus Better
        // Auth's own DB-backed verification record already authenticate the
        // callback, so this redundant cookie check is safe to skip.
        skipStateCookieCheck: true,
        additionalFields: {
          tenantId: { type: 'string', input: false },
        },
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
              const tenantId = explicitTenantId ?? (await ensureTenantId())
              if (!tenantId) {
                throw new APIError('BAD_REQUEST', {
                  message: 'Missing tenant context during account creation.',
                })
              }

              return {
                data: {
                  ...user,
                  tenantId,
                  role: user.role ?? 'user',
                },
              }
            },
          },
        },
        session: {
          create: {
            before: async (session) => {
              const tenantId = explicitTenantId ?? this.resolveTenantIdFromContext()
              const fallbackTenantId = tenantId ?? session.tenantId ?? (await ensureTenantId())
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
              const tenantId = explicitTenantId ?? this.resolveTenantIdFromContext()
              const resolvedTenantId = tenantId ?? (await ensureTenantId())
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
        database: {
          generateId: () => generateId(),
        },
      },
      plugins: [
        expo(),
        admin({
          adminRoles: ['admin'],
          defaultRole: 'user',
          defaultBanReason: 'Spamming',
        }),
        ...(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET
          ? [
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
            ]
          : []),
      ],
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path !== '/sign-up/email') {
            return
          }

          try {
            await this.systemSettings.ensureRegistrationAllowed()
          }
          catch (error) {
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

  private resolveRequestSlug(options: AuthModuleOptions): string | null {
    const endpoint = this.resolveRequestEndpoint()
    const fallbackHost = options.baseDomain.trim().toLowerCase()
    const requestedHost = (endpoint.host ?? fallbackHost).trim().toLowerCase()
    return this.resolveTenantSlugFromContext() ?? extractTenantSlugFromHost(requestedHost, options.baseDomain)
  }

  async isBrokerRequest(): Promise<boolean> {
    const options = await this.config.getOptions()
    return this.resolveRequestSlug(options) === MOBILE_AUTH_BROKER_SLUG
  }

  async getAuth(): Promise<BetterAuthInstance> {
    const options = await this.config.getOptions()
    const tenantSlug = this.resolveRequestSlug(options)
    if (tenantSlug === MOBILE_AUTH_BROKER_SLUG) {
      return await this.createAuthForBroker(options)
    }
    const instancePromise = this.createAuthForEndpoint(tenantSlug, options)
    return await instancePromise
  }

  private async createAuthForBroker(options: AuthModuleOptions): Promise<BetterAuthInstance> {
    const db = this.drizzleProvider.getDb()
    const socialProviders = this.buildBetterAuthProvidersForHost(options.socialProviders, options.oauthGatewayUrl)

    return betterAuth({
      database: brokerDrizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: authUsers,
          session: authSessions,
          account: authAccounts,
          verification: authVerifications,
        },
      }),
      socialProviders: socialProviders as any,
      emailAndPassword: { enabled: false },
      trustedOrigins: await this.buildTrustedOrigins(),
      session: {
        freshAge: 0,
        additionalFields: {
          tenantId: { type: 'string', input: false },
        },
      },
      account: {
        skipStateCookieCheck: true,
        additionalFields: {
          tenantId: { type: 'string', input: false },
        },
      },
      user: {
        additionalFields: {
          tenantId: { type: 'string', input: false },
          role: { type: 'string', input: false },
          creemCustomerId: { type: 'string', input: false },
        },
      },
      databaseHooks: {
        session: {
          create: {
            before: async (session) => {
              const [user] = await db
                .select({ tenantId: authUsers.tenantId })
                .from(authUsers)
                .where(eq(authUsers.id, session.userId))
                .limit(1)
              if (!user?.tenantId) {
                throw new APIError('UNAUTHORIZED', {
                  message: 'No workspace is linked to this account. Create your gallery on the web first.',
                })
              }
              return {
                data: {
                  ...session,
                  tenantId: user.tenantId,
                },
              }
            },
          },
        },
      },
      advanced: {
        database: {
          generateId: () => generateId(),
        },
      },
      plugins: [expo()],
    })
  }

  async getAuthForTenant(tenant: { id: string, slug?: string | null }): Promise<BetterAuthInstance> {
    const options = await this.config.getOptions()
    const tenantSlug = tenant.slug ?? null
    return await this.createAuthForEndpoint(tenantSlug, options, tenant.id)
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
      }
      catch (error) {
        logger.error(`[AuthProvider] Failed to update tenant ${tenantId} billing plan from Creem (${event})`, error)
      }
    }

    if (storagePlanId) {
      handled = true
      try {
        await this.storagePlanService.updateTenantPlan(tenantId, storagePlanId)
        logger.info(`[AuthProvider] Tenant ${tenantId} storage plan set to ${storagePlanId} via Creem (${event})`)
      }
      catch (error) {
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
      }
      catch (error) {
        logger.error(`[AuthProvider] Failed to downgrade tenant ${tenantId} after Creem ${event}`, error)
      }
    }

    if (storagePlanId) {
      handled = true
      try {
        await this.storagePlanService.updateTenantPlan(tenantId, null)
        logger.info(`[AuthProvider] Tenant ${tenantId} storage plan cleared via Creem (${event})`)
      }
      catch (error) {
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
