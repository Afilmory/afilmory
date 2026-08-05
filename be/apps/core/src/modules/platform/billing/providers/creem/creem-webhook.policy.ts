import { BILLING_PLAN_IDS } from '../../plan/billing-plan.constants'
import type { BillingPlanId } from '../../plan/billing-plan.types'

const SECONDS_TO_MILLISECONDS_THRESHOLD = 10_000_000_000

export function mergeCreemMetadata(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> | null {
  const merged = sources.filter(Boolean).reduce<Record<string, unknown>>((accumulator, current) => {
    Object.assign(accumulator, current as Record<string, unknown>)
    return accumulator
  }, {})
  return Object.keys(merged).length > 0 ? merged : null
}

export function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const raw = metadata?.[key]
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readMetadataPlanId(metadata?: Record<string, unknown>): BillingPlanId | null {
  const planId = readMetadataString(metadata, 'planId')
  return planId && BILLING_PLAN_IDS.includes(planId as BillingPlanId) ? (planId as BillingPlanId) : null
}

/** Creem timestamps arrive as either epoch seconds or milliseconds depending on the event. */
export function toCreemIsoDate(value: Date | number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const normalized = typeof value === 'number' && value < SECONDS_TO_MILLISECONDS_THRESHOLD ? value * 1000 : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
