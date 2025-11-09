import { HttpContext } from '@afilmory/framework'
import { BizException, ErrorCode } from 'core/errors'

import type { TenantContext } from './tenant.types'

declare module '@afilmory/framework' {
  interface HttpContextValues {
    tenant?: TenantContext
  }
}

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
