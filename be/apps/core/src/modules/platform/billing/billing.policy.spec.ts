import { describe, expect, it } from 'vitest'

import {
  isByoStorageActive,
  normalizeCreemSubscriptionStatus,
  selectEffectiveEntitlement,
  subscriptionGrantsEntitlement,
} from './billing.policy'

describe('billing policy', () => {
  it('preserves the selected BYO provider when managed storage becomes entitled', () => {
    const providerIds = new Set(['customer-s3'])

    expect(isByoStorageActive('customer-s3', providerIds)).toBe(true)
    expect(isByoStorageActive('managed', providerIds)).toBe(false)
    expect(isByoStorageActive('missing-provider', providerIds)).toBe(false)
  })

  it('preserves a cancelled subscription through its paid period', () => {
    const periodEnd = '2026-08-10T00:00:00.000Z'
    const now = new Date('2026-08-05T00:00:00.000Z').getTime()

    expect(normalizeCreemSubscriptionStatus({ cancelAtPeriodEnd: true, periodEnd, status: 'canceled' }, now)).toBe(
      'cancel_scheduled',
    )
    expect(subscriptionGrantsEntitlement('cancel_scheduled', periodEnd, now)).toBe(true)
  })

  it('does not grant billing-retry access without an explicit grace period', () => {
    expect(normalizeCreemSubscriptionStatus({ status: 'past_due' })).toBe('billing_retry')
    expect(subscriptionGrantsEntitlement('billing_retry', null)).toBe(false)
    expect(subscriptionGrantsEntitlement('grace_period', '2026-08-10T00:00:00.000Z', Date.parse('2026-08-05'))).toBe(
      true,
    )
  })

  it('keeps a manual grant when a provider grant is revoked', () => {
    const selected = selectEffectiveEntitlement(
      [
        {
          endsAt: null,
          rank: 10,
          sourceType: 'subscription',
          startsAt: '2026-08-01T00:00:00.000Z',
          value: 'managed-5gb',
        },
        {
          endsAt: null,
          rank: 1,
          sourceType: 'manual',
          startsAt: '2026-07-01T00:00:00.000Z',
          value: 'managed-50gb',
        },
      ],
      Date.parse('2026-08-05'),
    )

    expect(selected?.value).toBe('managed-50gb')
  })
})
