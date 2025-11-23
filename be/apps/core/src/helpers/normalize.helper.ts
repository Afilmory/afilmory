import { BizException, ErrorCode } from 'core/errors'

/**
 * Normalizes a string value by trimming whitespace.
 * Returns null if the value is not a string or is empty after trimming.
 */
export function normalizeString(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalizes a string value by trimming whitespace.
 * Returns undefined if the value is not a string or is empty after trimming.
 * This variant is useful when you need undefined instead of null for optional properties.
 */
export function normalizeStringToUndefined(value?: string | null): string | undefined {
  const normalized = normalizeString(value)
  return normalized ?? undefined
}

/**
 * Normalizes a nullable string value by trimming whitespace.
 * Returns null if the value is null, undefined, or is empty after trimming.
 * This is an alias for normalizeString that provides clearer semantics for nullable values.
 */
export function normalizeNullableString(value: string | null | undefined): string | null {
  return normalizeString(value)
}

/**
 * Normalizes a number value.
 * Returns 0 if the value is not a valid finite number.
 * Negative values are clamped to 0.
 */
export function normalizeNumber(value?: number | null): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, value)
}

/**
 * Normalizes a number value to an integer.
 * Returns 0 if the value is not a valid finite number.
 * Negative values are clamped to 0.
 * Decimal values are truncated (not rounded).
 */
export function normalizeInteger(value?: number | null): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.trunc(value))
}

/**
 * Normalizes a date value to an ISO string.
 * Accepts Date objects or date strings.
 * Returns null if the value cannot be parsed as a valid date.
 */
export function normalizeDate(value?: Date | string | null): string | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }
  return new Date(timestamp).toISOString()
}

/**
 * Requires a string value to be present and non-empty.
 * Throws a BizException if the value is missing or empty after normalization.
 * @param value - The value to validate
 * @param label - The label/name of the field for error messages
 * @returns The normalized string value
 */
export function requireString(value: string | undefined | null, label: string): string {
  const normalized = normalizeString(value)
  if (!normalized) {
    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: `缺少必填字段 ${label}` })
  }
  return normalized
}

/**
 * Requires a string value to be present and non-empty.
 * Throws a BizException if the value is missing or empty after normalization.
 * @param value - The value to validate
 * @param message - Custom error message
 * @returns The normalized string value
 */
export function requireStringWithMessage(value: string | undefined | null, message: string): string {
  const normalized = normalizeString(value)
  if (!normalized) {
    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message })
  }
  return normalized
}
