import { injectable } from 'tsyringe'

import { CONTROLLER_METADATA } from '../constants'
import type { Constructor } from '../interfaces'

export interface ControllerMetadata {
  prefix: string
  bypassGlobalPrefix: boolean
}

export interface ControllerOptions {
  prefix?: string
  bypassGlobalPrefix?: boolean
}

function normalizeControllerOptions(prefixOrOptions: string | ControllerOptions | undefined): ControllerMetadata {
  if (typeof prefixOrOptions === 'string' || prefixOrOptions === undefined) {
    return {
      prefix: prefixOrOptions ?? '',
      bypassGlobalPrefix: false,
    }
  }

  return {
    prefix: prefixOrOptions.prefix ?? '',
    bypassGlobalPrefix: prefixOrOptions.bypassGlobalPrefix ?? false,
  }
}

export function Controller(prefixOrOptions: string | ControllerOptions = ''): ClassDecorator {
  const metadata = normalizeControllerOptions(prefixOrOptions)

  return (target) => {
    Reflect.defineMetadata(CONTROLLER_METADATA, metadata satisfies ControllerMetadata, target as unknown as Constructor)

    injectable()(target as unknown as Constructor)
  }
}

export function getControllerMetadata(target: Constructor): ControllerMetadata {
  const metadata = Reflect.getMetadata(CONTROLLER_METADATA, target) as Partial<ControllerMetadata> | undefined

  return {
    prefix: metadata?.prefix ?? '',
    bypassGlobalPrefix: metadata?.bypassGlobalPrefix ?? false,
  }
}
