import { authAccounts, authSessions, authUsers, authVerifications, generateId } from '@afilmory/db'
import type { OnModuleInit } from '@afilmory/framework'
import { createLogger, HttpContext } from '@afilmory/framework'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import { DrizzleProvider } from 'core/database/database.provider'
import { BizException } from 'core/errors'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { TenantService } from '../tenant/tenant.service'
import type { AuthModuleOptions, SocialProviderOptions, SocialProvidersConfig } from './auth.config'
import { AuthConfig } from './auth.config'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

const logger = createLogger('Auth')

@injectable()
export class AuthProvider implements OnModuleInit {
  private moduleOptionsPromise?: Promise<AuthModuleOptions>
  private instances = new Map<string, Promise<BetterAuthInstance>>()
  private placeholderTenantId: string | null = null

  constructor(
    private readonly config: AuthConfig,
    private readonly drizzleProvider: DrizzleProvider,
    private readonly systemSettings: SystemSettingService,
    private readonly tenantService: TenantService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getAuth()
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
      const tenantContext = HttpContext.getValue('tenant') as { tenant?: { slug?: string | null } } | undefined
      const slug = tenantContext?.tenant?.slug
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

  private async getModuleOptions(): Promise<AuthModuleOptions> {
    if (!this.moduleOptionsPromise) {
      this.moduleOptionsPromise = this.config.getOptions()
    }
    return this.moduleOptionsPromise
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
    host: string,
    protocol: string,
    providers: SocialProvidersConfig,
  ): Record<string, { clientId: string; clientSecret: string; redirectUri?: string }> {
    const entries: Array<[keyof SocialProvidersConfig, SocialProviderOptions]> = Object.entries(providers).filter(
      (entry): entry is [keyof SocialProvidersConfig, SocialProviderOptions] => Boolean(entry[1]),
    )

    return entries.reduce<Record<string, { clientId: string; clientSecret: string; redirectURI?: string }>>(
      (acc, [key, value]) => {
        const redirectUri = this.buildRedirectUri(protocol, host, key, value)
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
    protocol: string,
    host: string,
    provider: keyof SocialProvidersConfig,
    options: SocialProviderOptions,
  ): string | null {
    const basePath = options.redirectPath ?? `/api/auth/callback/${provider}`
    if (!basePath.startsWith('/')) {
      return null
    }
    return `${protocol}://${host}${basePath}`
  }

  private async createAuthForEndpoint(
    host: string,
    protocol: string,
    tenantSlug: string | null,
  ): Promise<BetterAuthInstance> {
    const options = await this.getModuleOptions()
    const db = this.drizzleProvider.getDb()
    const socialProviders = this.buildBetterAuthProvidersForHost(host, protocol, options.socialProviders)
    const cookiePrefix = this.buildCookiePrefix(tenantSlug)

    return betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: authUsers,
          session: authSessions,
          account: authAccounts,
          verification: authVerifications,
        },
      }),
      socialProviders: socialProviders as any,
      emailAndPassword: { enabled: true },
      session: {
        freshAge: 0,
      },
      user: {
        additionalFields: {
          tenantId: { type: 'string', input: false },
          role: { type: 'string', input: false },
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
    const options = await this.getModuleOptions()
    const endpoint = this.resolveRequestEndpoint()
    const fallbackHost = options.baseDomain.trim().toLowerCase()
    const requestedHost = (endpoint.host ?? fallbackHost).trim().toLowerCase()
    const tenantSlug = this.resolveTenantSlugFromContext()
    const host = this.applyTenantSlugToHost(requestedHost || fallbackHost, fallbackHost, tenantSlug)
    const protocol = this.determineProtocol(host, endpoint.protocol)
    const slugKey = tenantSlug ?? 'global'
    const cacheKey = `${protocol}://${host}::${slugKey}`

    if (!this.instances.has(cacheKey)) {
      const instancePromise = this.createAuthForEndpoint(host, protocol, tenantSlug).then((instance) => {
        logger.info(`Better Auth initialized for ${cacheKey}`)
        return instance
      })
      this.instances.set(cacheKey, instancePromise)
    }

    return await this.instances.get(cacheKey)!
  }

  async handler(context: Context): Promise<Response> {
    const auth = await this.getAuth()
    return auth.handler(context.req.raw)
  }
}

export type AuthInstance = BetterAuthInstance
export type AuthSession = BetterAuthInstance['$Infer']['Session']
