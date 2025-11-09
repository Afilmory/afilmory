import type { TenantResolutionOptions } from '../modules/tenant/tenant-context-resolver.service'

export const TENANT_RESOLUTION_OPTIONS = Symbol('core:tenantResolutionOptions')

type DecoratorTarget = object | Function

function setMetadata(target: DecoratorTarget, options: TenantResolutionOptions): void {
  Reflect.defineMetadata(TENANT_RESOLUTION_OPTIONS, options, target)
}

export function TenantResolution(options: TenantResolutionOptions): ClassDecorator & MethodDecorator {
  return ((
    target: DecoratorTarget,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void | PropertyDescriptor => {
    if (descriptor && descriptor.value) {
      setMetadata(descriptor.value as DecoratorTarget, options)
      return descriptor
    }

    setMetadata(target, options)
  }) as unknown as ClassDecorator & MethodDecorator
}
