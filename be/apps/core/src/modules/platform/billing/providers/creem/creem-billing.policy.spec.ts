import { describe, expect, it } from 'vitest'

import { subscriptionGrantsEntitlement } from '../../entitlement/billing-entitlement.policy'
import { normalizeCreemSubscriptionStatus } from './creem-billing.policy'

describe('creem billing policy', () => {
  it('preserves a cancelled subscription through its paid period', () => {
    const periodEnd = '2026-08-10T00:00:00.000Z'
    const now = new Date('2026-08-05T00:00:00.000Z').getTime()

    expect(normalizeCreemSubscriptionStatus({ cancelAtPeriodEnd: true, periodEnd, status: 'canceled' }, now)).toBe(
      'cancel_scheduled',
    )
    expect(subscriptionGrantsEntitlement('cancel_scheduled', periodEnd, now)).toBe(true)
  })

  it('maps a past-due subscription to billing retry', () => {
    expect(normalizeCreemSubscriptionStatus({ status: 'past_due' })).toBe('billing_retry')
  })
})
