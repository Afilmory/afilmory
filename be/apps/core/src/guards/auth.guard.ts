import { authUsers } from '@afilmory/db'
import type { CanActivate, ExecutionContext } from '@afilmory/framework'
import { HttpContext } from '@afilmory/framework'
import type { HttpContextAuth } from 'core/context/http-context.values'
import { applyTenantIsolationContext, DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { getTenantContext } from 'core/modules/platform/tenant/tenant.context'
import type { TenantContext } from 'core/modules/platform/tenant/tenant.types'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { shouldSkipTenant } from '../decorators/skip-tenant.decorator'
import { logger } from '../helpers/logger.helper'
import type { AuthSession } from '../modules/auth/auth.provider'
import { getAllowedRoleMask, roleNameToBit } from './roles.decorator'

@injectable()
export class AuthGuard implements CanActivate {
  private readonly log = logger.extend('AuthGuard')

  constructor(private readonly dbAccessor: DbAccessor) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = context.getContext()
    const { hono } = store
    const { method, path } = hono.req
    const handler = context.getHandler()
    const targetClass = context.getClass()
    const skipTenant = shouldSkipTenant(handler) || shouldSkipTenant(targetClass)
    const authContext = HttpContext.getValue('auth')

    if (skipTenant) {
      this.log.verbose(`Skip guard and tenant resolution for ${method} ${path}`)
      return true
    }

    this.log.verbose(`Evaluating guard for ${method} ${path}`)

    const tenantContext = this.requireTenantContext(method, path)

    await this.enforceTenantOwnership(authContext, tenantContext, method, path)
    this.enforceRoleRequirements(handler, authContext, method, path)

    return true
  }

  private requireTenantContext(method: string, path: string) {
    const tenantContext = getTenantContext()
    if (!tenantContext) {
      this.log.warn(`Tenant context not resolved for ${method} ${path}`)
      throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
    }
    return tenantContext
  }

  private async enforceTenantOwnership(
    authContext: HttpContextAuth | undefined,
    tenantContext: TenantContext,
    method: string,
    path: string,
  ): Promise<void> {
    if (!authContext?.user || !authContext.session) {
      return
    }

    const authSession = { user: authContext.user, session: authContext.session } as AuthSession
    const roleName = (authSession.user as { role?: string }).role as
      | 'user'
      | 'admin'
      | 'superadmin'
      | 'guest'
      | undefined
    const isSuperAdmin = roleName === 'superadmin'

    if (!isSuperAdmin) {
      const tenantId = await this.resolveTenantIdForSession(authSession, method, path)

      if (tenantId !== tenantContext.tenant.id) {
        this.log.warn(
          `Denied access: session tenant=${tenantId ?? 'n/a'} does not match context tenant=${tenantContext.tenant.id} for ${method} ${path}`,
        )
        throw new BizException(ErrorCode.AUTH_FORBIDDEN)
      }
    }

    await applyTenantIsolationContext({
      tenantId: tenantContext.tenant.id,
      isSuperAdmin,
    })
  }

  private async resolveTenantIdForSession(authSession: AuthSession, method: string, path: string): Promise<string> {
    let sessionTenantId = (authSession.user as { tenantId?: string | null }).tenantId ?? null

    if (sessionTenantId) {
      return sessionTenantId
    }

    if (!authSession.user) {
      this.log.warn(`Denied access: session user missing for ${method} ${path}`)
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }

    const db = this.dbAccessor.get()
    const [record] = await db
      .select({ tenantId: authUsers.tenantId })
      .from(authUsers)
      .where(eq(authUsers.id, authSession.user.id))
      .limit(1)

    sessionTenantId = record?.tenantId ?? ''

    if (!sessionTenantId) {
      this.log.warn(
        `Denied access: session ${(authSession.user as { id?: string }).id ?? 'unknown'} missing tenant id for ${method} ${path}`,
      )
      throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
    }

    return sessionTenantId
  }

  private enforceRoleRequirements(
    handler: ReturnType<ExecutionContext['getHandler']>,
    authContext: HttpContextAuth | undefined,
    method: string,
    path: string,
  ): void {
    const requiredMask = getAllowedRoleMask(handler)
    if (requiredMask === 0) {
      return
    }

    if (!authContext?.user || !authContext.session) {
      this.log.warn(`Denied access: missing session for protected resource ${method} ${path}`)
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }

    const userRoleName = (authContext.user as { role?: string }).role as
      | 'user'
      | 'admin'
      | 'superadmin'
      | 'guest'
      | undefined
    const userMask = userRoleName ? roleNameToBit(userRoleName) : 0
    const hasRole = (requiredMask & userMask) !== 0
    if (!hasRole) {
      this.log.warn(
        `Denied access: user ${(authContext.user as { id?: string }).id ?? 'unknown'} role=${userRoleName ?? 'n/a'} lacks permission mask=${requiredMask} on ${method} ${path}`,
      )
      throw new BizException(ErrorCode.AUTH_FORBIDDEN)
    }
  }
}
