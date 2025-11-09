const CAMELIZE_PATTERN = /[_.-](\w|$)/g

function camelCase(value: string): string {
  if (!value || (!value.includes('_') && !value.includes('-') && !value.includes('.'))) {
    return value
  }

  return value.replaceAll(CAMELIZE_PATTERN, (_match, group: string) => group.toUpperCase())
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function camelCaseKeys<T>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map((item) => camelCaseKeys(item)) as unknown as T
  }

  if (isPlainObject(input)) {
    const entries = Object.entries(input).map(([key, val]) => [camelCase(key), camelCaseKeys(val)])

    return Object.fromEntries(entries) as T
  }

  return input as T
}
