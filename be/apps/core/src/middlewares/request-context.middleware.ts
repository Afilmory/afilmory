import type { HttpMiddleware } from '@afilmory/framework'
import { HttpContext, Middleware } from '@afilmory/framework'
import { logger } from 'core/helpers/logger.helper'
import type { AuthSession } from 'core/modules/platform/auth/auth.provider'
import { AuthProvider } from 'core/modules/platform/auth/auth.provider'
import { getTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { TenantContextResolver } from 'core/modules/platform/tenant/tenant-context-resolver.service'
import type { Context, Next } from 'hono'
import { injectable } from 'tsyringe'

@Middleware({ priority: -1 })
@injectable()
export class RequestContextMiddleware implements HttpMiddleware {
  private readonly log = logger.extend('RequestContextMiddleware')

  constructor(
    private readonly tenantContextResolver: TenantContextResolver,
    private readonly authProvider: AuthProvider,
  ) {}

  async use(context: Context, next: Next): Promise<Response | void> {
    await Promise.all([this.ensureTenantContext(context), this.ensureAuthContext(context)])
    return await next()
  }

  private async ensureTenantContext(context: Context): Promise<void> {
    if (getTenantContext()) {
      return
    }

    try {
      const tenantContext = await this.tenantContextResolver.resolve(context, {
        setResponseHeaders: false,
        throwOnMissing: false,
        skipInitializationCheck: true,
      })
      if (tenantContext) {
        HttpContext.setValue('tenant', tenantContext)
      }
    } catch (error) {
      this.log.error(`Failed to resolve tenant context for ${context.req.method} ${context.req.path}`, error)
    }
  }

  private async ensureAuthContext(context: Context): Promise<void> {
    const authSession = await this.resolveAuthSession(context)
    if (!authSession) {
      return
    }

    HttpContext.assign({
      auth: {
        user: authSession.user,
        session: authSession.session,
      },
    })
  }

  private async resolveAuthSession(context: Context): Promise<AuthSession | null> {
    try {
      const { headers } = context.req.raw
      const globalAuth = await this.authProvider.getAuth()
      const authSession = await globalAuth.api.getSession({ headers })

      if (authSession) {
        this.log.verbose(
          `Session detected for user ${(authSession.user as { id?: string }).id ?? 'unknown'} on ${context.req.method} ${context.req.path}`,
        )
      } else {
        this.log.verbose(`No active session for ${context.req.method} ${context.req.path}`)
      }

      return authSession
    } catch (error) {
      this.log.error('Failed to resolve auth session from middleware', error)
      return null
    }
  }
}
