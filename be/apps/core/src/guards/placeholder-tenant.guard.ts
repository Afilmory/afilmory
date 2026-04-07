import type { CanActivate, ExecutionContext } from '@tsuki/framework'
import { isPlaceholderTenantAllowed } from 'core/decorators/allow-placeholder.decorator'
import { BizException, ErrorCode } from 'core/errors'
import { logger } from 'core/helpers/logger.helper'
import { getTenantContext, isPlaceholderTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { injectable } from 'tsyringe'

@injectable()
export class PlaceholderTenantGuard implements CanActivate {
  private readonly log = logger.extend('PlaceholderTenantGuard')

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler()
    const targetClass = context.getClass()

    if (isPlaceholderTenantAllowed(handler) || isPlaceholderTenantAllowed(targetClass)) {
      return true
    }

    const tenantContext = getTenantContext()
    if (!tenantContext || !isPlaceholderTenantContext(tenantContext)) {
      return true
    }

    const store = context.getContext()
    const { hono } = store
    const { method, path } = hono.req
    this.log.warn(`Denied placeholder tenant access for ${method} ${path}`)
    throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD, {
      message: 'Tenant context not available for this operation.',
    })
  }
}
