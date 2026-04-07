import { env } from '@afilmory/env'
import type { CallHandler, ExecutionContext, FrameworkResponse, Interceptor } from '@tsuki/framework'
import { injectable } from 'tsyringe'

import { RESPONSE_TRANSFORM_BYPASS } from './response-transform.decorator'

function isPrimitive(value: unknown): value is string | number | boolean | null {
  const type = typeof value
  return value == null || type === 'string' || type === 'number' || type === 'boolean'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function snakeCase(input: string): string {
  if (input.length === 0) return input
  const replaced = input
    .replaceAll(/[\s.-]+/g, '_')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1_$2')
    .replaceAll(/_{2,}/g, '_')
  return replaced.toLowerCase()
}

function isJsonLikeContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const lower = contentType.toLowerCase()
  return lower.includes('json')
}

function shouldBypassTransform(target: object | Function | undefined): boolean {
  if (!target) return false
  try {
    return Boolean(Reflect.getMetadata(RESPONSE_TRANSFORM_BYPASS, target))
  } catch {
    return false
  }
}

function transformKeysToSnakeCase(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (isPrimitive(value)) return value

  if (Array.isArray(value)) {
    return value.map((item) => transformKeysToSnakeCase(item, seen))
  }

  if (value instanceof Date || value instanceof RegExp || value instanceof URL || value instanceof Error) {
    return value
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>

    if (!isPlainObject(obj)) {
      return obj
    }

    const existing = seen.get(obj)
    if (existing) {
      return existing
    }

    const output: Record<string, unknown> = Object.create(null)
    seen.set(obj, output)

    for (const key of Object.keys(obj)) {
      // Skip dangerous keys and functions
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue
      }

      const val = obj[key]
      if (typeof val === 'function') {
        continue
      }

      const newKey = snakeCase(key)
      output[newKey] = transformKeysToSnakeCase(val, seen)
    }

    return output
  }

  return value
}

@injectable()
export class ResponseTransformInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const handler = context.getHandler()
    const clazz = context.getClass()

    if (shouldBypassTransform(handler) || shouldBypassTransform(clazz) || env.TEST) {
      return await next.handle()
    }

    const response = await next.handle()

    // Only process JSON responses with bodies
    const contentType = response.headers.get('content-type')
    if (!isJsonLikeContentType(contentType)) {
      return response
    }

    // Avoid transforming empty bodies or no-content statuses
    if (response.status === 204 || response.status === 304) {
      return response
    }

    // Read body safely from a clone
    let rawText = ''
    try {
      const clone = response.clone()
      rawText = await clone.text()
    } catch {
      return response
    }

    if (!rawText) {
      return response
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawText)
    } catch {
      return response
    }

    // Transform only objects/arrays
    if (!isPlainObject(payload) && !Array.isArray(payload)) {
      return response
    }

    const transformed = transformKeysToSnakeCase(payload)
    const body = JSON.stringify(transformed === undefined ? null : transformed)

    const headers = new Headers(response.headers)
    headers.set('content-type', contentType || 'application/json; charset=utf-8')
    headers.delete('content-length')

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }) as FrameworkResponse
  }
}
