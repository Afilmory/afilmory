import type { QuotaReason } from './billing-quota.error'

export const QUOTA_WARNING_RATIO = 0.8

export type QuotaUnit = 'bytes' | 'count' | 'megabytes'

export interface QuotaDimension {
  reason: QuotaReason
  used: number
  limit: number | null
  unit: QuotaUnit
  nearingLimit: boolean
}

interface QuotaMeasure {
  limit: number | null
  used: number
}

export interface QuotaUsageInput {
  customDomains: QuotaMeasure
  libraryItems: QuotaMeasure
  monthlyProcess: QuotaMeasure
  storage: QuotaMeasure
}

function toDimension(reason: QuotaReason, unit: QuotaUnit, measure: QuotaMeasure): QuotaDimension {
  const nearingLimit
    = measure.limit !== null && measure.limit > 0 && measure.used / measure.limit >= QUOTA_WARNING_RATIO
  return { reason, used: measure.used, limit: measure.limit, unit, nearingLimit }
}

// `upload_size` and `sync_object_size` are per-file ceilings rather than consumable allowances, so
// they have no running total to warn about and exist only as wall reasons.
export function summarizeQuotas(input: QuotaUsageInput): QuotaDimension[] {
  return [
    toDimension('storage', 'bytes', input.storage),
    toDimension('monthly_process', 'count', input.monthlyProcess),
    toDimension('library_items', 'count', input.libraryItems),
    toDimension('custom_domain', 'count', input.customDomains),
  ]
}
