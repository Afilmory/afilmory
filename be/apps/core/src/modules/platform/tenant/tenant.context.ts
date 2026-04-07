import { HttpContext } from '@tsuki/framework'
import { BizException, ErrorCode } from 'core/errors'

import type { TenantContext } from './tenant.types'

export function getTenantContext<TRequired extends boolean = false>(options?: {
  required?: TRequired
}): TRequired extends true ? TenantContext : TenantContext | undefined {
  const context = HttpContext.getValue('tenant')
  if (options?.required && !context) {
    throw new BizException(ErrorCode.TENANT_NOT_FOUND)
  }
  return context as TRequired extends true ? TenantContext : TenantContext | undefined
}

export function requireTenantContext(): TenantContext {
  return getTenantContext({ required: true })
}

export function isPlaceholderTenantContext(context?: TenantContext | null): boolean {
  if (!context) {
    return false
  }
  if (typeof context.isPlaceholder === 'boolean') {
    return context.isPlaceholder
  }
  return context.tenant.status !== 'active'
}
