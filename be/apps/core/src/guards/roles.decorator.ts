import { applyDecorators } from '@tsuki/framework'

export const ROLES_METADATA = Symbol.for('core.auth.allowed_roles')

export enum RoleBit {
  GUEST = 1 << 0,
  USER = 1 << 1,
  ADMIN = 1 << 2,
  SUPERADMIN = 1 << 3,
}

export type RoleName = 'user' | 'admin' | 'superadmin' | (string & {})

export function roleNameToBit(name?: RoleName): RoleBit {
  switch (name) {
    case 'superadmin': {
      return RoleBit.SUPERADMIN
    }

    case 'admin': {
      return RoleBit.ADMIN
    }

    case 'user': {
      return RoleBit.USER
    }

    default: {
      return RoleBit.GUEST
    }
  }
}

export function roleBitWithInheritance(bit: RoleBit): number {
  switch (bit) {
    case RoleBit.SUPERADMIN: {
      return RoleBit.SUPERADMIN | RoleBit.ADMIN | RoleBit.USER | RoleBit.GUEST
    }
    case RoleBit.ADMIN: {
      return RoleBit.ADMIN | RoleBit.USER | RoleBit.GUEST
    }
    case RoleBit.USER: {
      return RoleBit.USER | RoleBit.GUEST
    }

    default: {
      return RoleBit.GUEST
    }
  }
}

export function Roles(...roles: Array<RoleBit | RoleName>): MethodDecorator & ClassDecorator {
  const mask = roles.map((r) => (typeof r === 'string' ? roleNameToBit(r) : r)).reduce((m, r) => m | r, 0)

  return applyDecorators((target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const targetForMetadata = descriptor?.value && typeof descriptor.value === 'function' ? descriptor.value : target
    Reflect.defineMetadata(ROLES_METADATA, mask, targetForMetadata)
  })
}

export function getAllowedRoleMask(target: object): number {
  return (Reflect.getMetadata(ROLES_METADATA, target) || 0) as number
}
