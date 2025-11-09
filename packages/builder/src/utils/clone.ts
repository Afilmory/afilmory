import { deserialize as v8Deserialize, serialize as v8Serialize } from 'node:v8'

function manualClone<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (typeof value === 'function') {
    return value
  }

  if (value instanceof Date) {
    return new Date(value) as unknown as T
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as unknown as T
  }

  if (value instanceof Map) {
    const result = new Map()
    seen.set(value, result)
    for (const [key, val] of value.entries()) {
      result.set(manualClone(key, seen), manualClone(val, seen))
    }
    return result as unknown as T
  }

  if (value instanceof Set) {
    const result = new Set()
    seen.set(value, result)
    for (const item of value.values()) {
      result.add(manualClone(item, seen))
    }
    return result as unknown as T
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T
  }

  if (Array.isArray(value)) {
    const result: unknown[] = []
    seen.set(value, result)
    for (const item of value) {
      result.push(manualClone(item, seen))
    }
    return result as unknown as T
  }

  const proto = Object.getPrototypeOf(value)
  const result = Object.create(proto ?? Object.prototype)
  seen.set(value as object, result)

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor) continue
    if ('value' in descriptor) {
      descriptor.value = manualClone(descriptor.value, seen)
    }
    Object.defineProperty(result, key, descriptor)
  }

  return result as T
}

export function clone<T>(value: T): T {
  const maybeStructuredClone = (
    globalThis as typeof globalThis & {
      structuredClone?: <U>(input: U) => U
    }
  ).structuredClone

  if (typeof maybeStructuredClone === 'function') {
    try {
      return maybeStructuredClone(value)
    } catch {
      // Fall through to other clone strategies when structuredClone cannot handle the value
    }
  }

  try {
    return v8Deserialize(v8Serialize(value))
  } catch {
    return manualClone(value)
  }
}
