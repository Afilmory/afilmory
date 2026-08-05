import { BizException, ErrorCode } from '@core/errors'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { HttpContext } from '@tsuki-hono/common'

export interface SessionIdentity {
  activeTenantId: string | null
  userId: string
}

export interface TenantIdentity {
  tenantId: string
  userId: string
}

export function requireSessionIdentity(): SessionIdentity {
  const auth = HttpContext.getValue('auth')
  if (!auth?.user || !auth.session) {
    throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
  }
  return { activeTenantId: auth.session.activeTenantId ?? null, userId: auth.user.id }
}

export function requireActiveTenantIdentity(): TenantIdentity {
  const identity = requireSessionIdentity()
  if (!identity.activeTenantId) {
    throw new BizException(ErrorCode.TENANT_NOT_FOUND)
  }
  return { tenantId: identity.activeTenantId, userId: identity.userId }
}

export function requireResolvedTenantIdentity(): TenantIdentity {
  const auth = HttpContext.getValue('auth')
  if (!auth?.user) {
    throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
  }
  return { tenantId: requireTenantContext().tenant.id, userId: auth.user.id }
}
