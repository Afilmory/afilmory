const SKIP_TENANT_METADATA = Symbol.for('core.tenant.skip')

type DecoratorTarget = object | Function

function setSkipTenantMetadata(target: DecoratorTarget): void {
  Reflect.defineMetadata(SKIP_TENANT_METADATA, true, target)
}

export function SkipTenant(): ClassDecorator & MethodDecorator {
  return ((target: DecoratorTarget, _propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor?.value && typeof descriptor.value === 'function') {
      setSkipTenantMetadata(descriptor.value)
      return descriptor
    }

    setSkipTenantMetadata(target)
    return descriptor
  }) as unknown as ClassDecorator & MethodDecorator
}

export function shouldSkipTenant(target: DecoratorTarget | undefined): boolean {
  if (!target) {
    return false
  }

  try {
    return (Reflect.getMetadata(SKIP_TENANT_METADATA, target) ?? false) === true
  } catch {
    return false
  }
}
