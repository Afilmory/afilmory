import { authUsers } from '@afilmory/db'
import type { CanActivate, ExecutionContext } from '@afilmory/framework'
import { HttpContext } from '@afilmory/framework'
import type { Session } from 'better-auth'
import { applyTenantIsolationContext, DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { getTenantContext } from 'core/modules/tenant/tenant.context'
import { TenantContextResolver } from 'core/modules/tenant/tenant-context-resolver.service'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { shouldSkipTenant } from '../decorators/skip-tenant.decorator'
import { logger } from '../helpers/logger.helper'
import type { AuthSession } from '../modules/auth/auth.provider'
import { AuthProvider } from '../modules/auth/auth.provider'
import { getAllowedRoleMask, roleNameToBit } from './roles.decorator'

declare module '@afilmory/framework' {
  interface HttpContextValues {
    auth?: {
      user?: AuthSession['user']
      session?: Session
    }
  }
}

@injectable()
export class AuthGuard implements CanActivate {
  private readonly log = logger.extend('AuthGuard')

  constructor(
    private readonly authProvider: AuthProvider,
    private readonly dbAccessor: DbAccessor,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = context.getContext()
    const { hono } = store
    const { method, path } = hono.req
    const handler = context.getHandler()
    const targetClass = context.getClass()

    if (shouldSkipTenant(handler) || shouldSkipTenant(targetClass)) {
      this.log.verbose(`Skip guard and tenant resolution for ${method} ${path}`)
      return true
    }

    this.log.verbose(`Evaluating guard for ${method} ${path}`)

    let tenantContext = getTenantContext()

    if (!tenantContext) {
      const resolvedTenant = await this.tenantContextResolver.resolve(hono, {
        setResponseHeaders: false,
      })
      if (resolvedTenant) {
        HttpContext.setValue('tenant', resolvedTenant)
        tenantContext = resolvedTenant
        this.log.verbose(
          `Resolved tenant context slug=${resolvedTenant.tenant.slug ?? 'n/a'} id=${resolvedTenant.tenant.id} for ${method} ${path}`,
        )
      } else {
        this.log.verbose(`Tenant context not resolved for ${method} ${path}`)
        tenantContext = undefined
      }
    }

    const { headers } = hono.req.raw

    const globalAuth = await this.authProvider.getAuth()
    const authSession: AuthSession | null = await globalAuth.api.getSession({ headers })

    if (authSession) {
      this.log.verbose(`Session detected for user ${(authSession.user as { id?: string }).id ?? 'unknown'}`)
    } else {
      this.log.verbose('No session context available (no tenant resolved and no active session)')
    }

    if (authSession) {
      HttpContext.assign({
        auth: {
          user: authSession.user,
          session: authSession.session,
        },
      })
      const userRoleValue = (authSession.user as { role?: string }).role
      const roleName = userRoleValue as 'user' | 'admin' | 'superadmin' | 'guest' | undefined
      const isSuperAdmin = roleName === 'superadmin'
      let sessionTenantId = (authSession.user as { tenantId?: string | null }).tenantId ?? null

      if (!isSuperAdmin) {
        if (!sessionTenantId) {
          const db = this.dbAccessor.get()
          const [record] = await db
            .select({ tenantId: authUsers.tenantId })
            .from(authUsers)
            .where(eq(authUsers.id, authSession.user.id))
            .limit(1)
          sessionTenantId = record?.tenantId ?? ''
        }

        if (!sessionTenantId) {
          this.log.warn(
            `Denied access: session ${(authSession.user as { id?: string }).id ?? 'unknown'} missing tenant id for ${method} ${path}`,
          )
          throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
        }

        if (!tenantContext) {
          this.log.warn(
            `Denied access: tenant context missing while session tenant=${sessionTenantId} accessing ${method} ${path}`,
          )
          throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
        }
        if (sessionTenantId !== tenantContext.tenant.id) {
          this.log.warn(
            `Denied access: session tenant=${sessionTenantId} does not match context tenant=${tenantContext.tenant.id} for ${method} ${path}`,
          )
          throw new BizException(ErrorCode.AUTH_FORBIDDEN)
        }
      }

      if (tenantContext) {
        await applyTenantIsolationContext({
          tenantId: tenantContext.tenant.id,
          isSuperAdmin,
        })
      }

      if (isSuperAdmin) {
        return true
      }
    }
    // Role verification if decorator is present
    const requiredMask = getAllowedRoleMask(handler)
    if (requiredMask > 0) {
      if (!authSession) {
        this.log.warn(`Denied access: missing session for protected resource ${method} ${path}`)
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
      }

      const userRoleName = (authSession.user as { role?: string }).role as
        | 'user'
        | 'admin'
        | 'superadmin'
        | 'guest'
        | undefined
      const userMask = userRoleName ? roleNameToBit(userRoleName) : 0
      const hasRole = (requiredMask & userMask) !== 0
      if (!hasRole) {
        this.log.warn(
          `Denied access: user ${(authSession.user as { id?: string }).id ?? 'unknown'} role=${userRoleName ?? 'n/a'} lacks permission mask=${requiredMask} on ${method} ${path}`,
        )
        throw new BizException(ErrorCode.AUTH_FORBIDDEN)
      }
    }
    return true
  }
}
