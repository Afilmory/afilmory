import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  creemSubscriptions,
  generateId,
  platformActivityEvents,
} from '@afilmory/db'
import { env } from '@afilmory/env'
import { DrizzleProvider } from '@core/database/database.provider'
import { BizException } from '@core/errors'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { CreemWebhookService } from '@core/modules/platform/billing/providers/creem/creem-webhook.service'
import type { OnModuleInit } from '@tsuki-hono/common'
import { createLogger, HttpContext } from '@tsuki-hono/common'
import type { BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { extractTenantSlugFromHost } from '../tenant/tenant-host.utils'
import { AppleAuthorizationService } from './apple-authorization.service'
import { AppleClientSecretService } from './apple-client-secret.service'
import type { AuthModuleOptions, SocialProviderOptions, SocialProvidersConfig } from './auth.config'
import { AuthConfig } from './auth.config'
import { AUTH_ACCOUNT_POLICY } from './auth-account.policy'
import { AUTH_ADMIN_PLUGIN_OPTIONS } from './auth-admin.policy'
import { AUTH_COOKIE_POLICY } from './auth-cookie.policy'
import { nativeOAuthSessionBridge } from './native-oauth.plugin'
import { WorkspaceMembershipService } from './workspace-membership.service'

type BetterAuthBaseInstance = ReturnType<typeof betterAuth>

export type BetterAuthInstance = BetterAuthBaseInstance & {
  api: BetterAuthBaseInstance['api'] & {
    generateOneTimeToken: (input: { headers: Headers }) => Promise<{ token: string }>
  }
}

const logger = createLogger('Auth')
const TRAILING_SLASHES_PATTERN = /\/+$/
const MOBILE_USER_AGENT_PATTERN = /Afilmory|Expo|CFNetwork/i

// The reserved `api` slug never resolves to a tenant, which makes its host the
// natural home for the mobile login broker: OAuth completes there and the
// provider identity is matched globally without requiring a workspace.
export const MOBILE_AUTH_BROKER_SLUG = 'api'

@injectable()
export class AuthProvider implements OnModuleInit {
  constructor(
    private readonly config: AuthConfig,
    private readonly drizzleProvider: DrizzleProvider,
    private readonly systemSettings: SystemSettingService,
    private readonly memberships: WorkspaceMembershipService,
    private readonly appleAuthorizations: AppleAuthorizationService,
    private readonly appleClientSecrets: AppleClientSecretService,
    private readonly creemWebhooks: CreemWebhookService,
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

  private async buildBetterAuthProvidersForHost(
    providers: SocialProvidersConfig,
    oauthGatewayUrl: string | null,
    apple: AuthModuleOptions['apple'],
  ): Promise<Record<string, unknown>> {
    const entries: Array<[keyof SocialProvidersConfig, SocialProviderOptions]> = Object.entries(providers).filter(
      (entry): entry is [keyof SocialProvidersConfig, SocialProviderOptions] => Boolean(entry[1]),
    )

    const result = entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
      const redirectUri = this.buildRedirectUri(key, oauthGatewayUrl)
      acc[key] = {
        clientId: value.clientId,
        clientSecret: value.clientSecret,
        ...(redirectUri ? { redirectURI: redirectUri } : {}),
      }
      return acc
    }, {})

    if (apple) {
      const redirectUri = apple.webEnabled ? this.buildRedirectUri('apple', oauthGatewayUrl) : null
      result.apple = {
        appBundleIdentifier: apple.appBundleIdentifier,
        audience: [apple.clientId, apple.appBundleIdentifier],
        clientId: apple.clientId,
        clientSecret: await this.appleClientSecrets.generate(apple),
        mapProfileToUser: async (profile: { email?: string, name?: string, sub: string }) => {
          const existing = await this.appleAuthorizations.resolveExistingProfile(profile.sub)
          return {
            email: profile.email || existing?.email,
            name: profile.name || existing?.name || 'Apple User',
          }
        },
        ...(redirectUri ? { redirectURI: redirectUri } : {}),
      }
    }

    return result
  }

  private buildRedirectUri(
    provider: keyof SocialProvidersConfig | 'apple',
    oauthGatewayUrl: string | null,
  ): string | null {
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
    const mobileOrigins = ['afilmory://', 'https://appleid.apple.com']

    if (env.NODE_ENV !== 'production') {
      return [
        'http://*.localhost:*',
        'https://*.localhost:*',
        'http://localhost:*',
        'https://localhost:*',
        'afilmory-local://',
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
    _tenantSlug: string | null,
    options: AuthModuleOptions,
    explicitTenantId?: string | null,
  ): Promise<BetterAuthInstance> {
    const db = this.drizzleProvider.getDb()
    const socialProviders = await this.buildBetterAuthProvidersForHost(
      options.socialProviders,
      options.oauthGatewayUrl,
      options.apple,
    )

    const requestedTenantId = explicitTenantId ?? this.resolveTenantIdFromContext()
    const auth = betterAuth({
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
      socialProviders: socialProviders as BetterAuthOptions['socialProviders'],
      emailAndPassword: { enabled: true },
      trustedOrigins: await this.buildTrustedOrigins(),
      session: {
        freshAge: 0,
        additionalFields: {
          activeTenantId: { type: 'string', input: false },
        },
      },
      account: AUTH_ACCOUNT_POLICY,

      user: {
        additionalFields: {
          role: { type: 'string', input: false },
          creemCustomerId: { type: 'string', input: false },
          deletionRequestedAt: { type: 'date', input: false, required: false },
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              return {
                data: {
                  ...user,
                  email: user.email.trim().toLowerCase(),
                  role: user.role ?? 'user',
                },
              }
            },
          },
        },
        session: {
          create: {
            before: async (session) => {
              const [user] = await db
                .select({ deletionRequestedAt: authUsers.deletionRequestedAt })
                .from(authUsers)
                .where(eq(authUsers.id, session.userId))
                .limit(1)
              if (user?.deletionRequestedAt) {
                throw new APIError('FORBIDDEN', { message: 'This account is being deleted.' })
              }
              const activeTenantId = await this.memberships.resolveInitialActiveTenantId(
                session.userId,
                requestedTenantId,
              )
              return {
                data: {
                  ...session,
                  activeTenantId,
                },
              }
            },
            after: async (session) => {
              const occurredAt = new Date().toISOString()
              const surface = MOBILE_USER_AGENT_PATTERN.test(session.userAgent ?? '') ? 'mobile' : 'web'
              await db.transaction(async (tx) => {
                await tx
                  .update(authUsers)
                  .set({ lastSignedInAt: occurredAt, lastActiveAt: occurredAt, lastActiveSurface: surface })
                  .where(eq(authUsers.id, session.userId))
                await tx.insert(platformActivityEvents).values({
                  userId: session.userId,
                  tenantId: typeof session.activeTenantId === 'string' ? session.activeTenantId : null,
                  sessionId: session.id,
                  eventType: 'auth.signed_in',
                  surface,
                  occurredAt,
                })
              })
            },
          },
        },
      },
      advanced: {
        ...AUTH_COOKIE_POLICY,
        database: {
          generateId: () => generateId(),
        },
      },
      plugins: [
        nativeOAuthSessionBridge(),
        admin(AUTH_ADMIN_PLUGIN_OPTIONS),
        ...this.creemWebhooks.createBetterAuthPlugins(),
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

    return auth as unknown as BetterAuthInstance
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
    return await this.createAuthForEndpoint(tenantSlug, options)
  }

  async getEnabledProviderIds(): Promise<string[]> {
    const options = await this.config.getOptions()
    return [...Object.keys(options.socialProviders), ...(options.apple ? ['apple'] : [])]
  }

  async getWebProviderIds(): Promise<string[]> {
    const options = await this.config.getOptions()
    return [...Object.keys(options.socialProviders), ...(options.apple?.webEnabled ? ['apple'] : [])]
  }

  async isProviderEnabled(provider: string): Promise<boolean> {
    return (await this.getEnabledProviderIds()).includes(provider)
  }

  async getAuthForTenant(tenant: { id: string, slug?: string | null }): Promise<BetterAuthInstance> {
    const options = await this.config.getOptions()
    const tenantSlug = tenant.slug ?? null
    return await this.createAuthForEndpoint(tenantSlug, options, tenant.id)
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

  async handleRequest(request: Request): Promise<Response> {
    const auth = await this.getAuth()
    return auth.handler(request)
  }
}

export type AuthInstance = BetterAuthInstance
export type AuthSession = BetterAuthInstance['$Infer']['Session']
