function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

export function camelCaseKeys<T>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map(item => camelCaseKeys(item)) as T
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [camelKey(key), camelCaseKeys(value)]),
    ) as T
  }
  return input as T
}
