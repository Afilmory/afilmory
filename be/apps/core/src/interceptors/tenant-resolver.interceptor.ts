import type { CallHandler, ExecutionContext, FrameworkResponse, Interceptor } from '@afilmory/framework'
import { injectable } from 'tsyringe'

import { shouldSkipTenant } from '../decorators/skip-tenant.decorator'
import type { TenantResolutionOptions } from '../modules/tenant/tenant-context-resolver.service'
import { TenantContextResolver } from '../modules/tenant/tenant-context-resolver.service'
import { TENANT_RESOLUTION_OPTIONS } from './tenant-resolver.decorator'

const DEFAULT_OPTIONS: Required<TenantResolutionOptions> = {
  throwOnMissing: true,
  setResponseHeaders: true,
  skipInitializationCheck: false,
}

function getResolutionOptions(target: object | Function | undefined): TenantResolutionOptions | undefined {
  if (!target) {
    return undefined
  }

  try {
    return Reflect.getMetadata(TENANT_RESOLUTION_OPTIONS, target) as TenantResolutionOptions | undefined
  } catch {
    return undefined
  }
}

function mergeOptions(
  classOptions: TenantResolutionOptions | undefined,
  handlerOptions: TenantResolutionOptions | undefined,
): TenantResolutionOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...classOptions,
    ...handlerOptions,
  }
}

@injectable()
export class TenantResolverInterceptor implements Interceptor {
  constructor(private readonly tenantContextResolver: TenantContextResolver) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const { hono } = context.getContext()
    const handler = context.getHandler()
    const clazz = context.getClass()

    if (shouldSkipTenant(handler) || shouldSkipTenant(clazz)) {
      return await next.handle()
    }

    const classOptions = getResolutionOptions(clazz)
    const handlerOptions = getResolutionOptions(handler)
    const resolutionOptions = mergeOptions(classOptions, handlerOptions)

    await this.tenantContextResolver.resolve(hono, resolutionOptions)

    return await next.handle()
  }
}
