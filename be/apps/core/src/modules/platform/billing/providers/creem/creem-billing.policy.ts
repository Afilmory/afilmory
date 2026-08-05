import type { BillingSubscriptionStatus } from '../../billing-domain.types'

export function normalizeCreemSubscriptionStatus(
  input: {
    cancelAtPeriodEnd?: boolean
    forceRevoke?: boolean
    periodEnd?: string | null
    status?: string | null
  },
  now = Date.now(),
): BillingSubscriptionStatus | null {
  if (input.forceRevoke) {
    return 'revoked'
  }

  const periodEnd = input.periodEnd ? new Date(input.periodEnd).getTime() : null
  const hasFuturePeriod = periodEnd !== null && !Number.isNaN(periodEnd) && periodEnd > now
  if (input.cancelAtPeriodEnd && hasFuturePeriod) {
    return 'cancel_scheduled'
  }

  switch (input.status?.trim().toLowerCase()) {
    case 'active':
    case 'paid':
    case 'trialing': {
      return 'active'
    }
    case 'past_due': {
      return 'billing_retry'
    }
    case 'canceled':
    case 'cancelled':
    case 'expired':
    case 'unpaid': {
      return 'expired'
    }
    case 'pending': {
      return 'pending'
    }
    default: {
      return null
    }
  }
}
