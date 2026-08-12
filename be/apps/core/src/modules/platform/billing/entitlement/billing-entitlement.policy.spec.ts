import { describe, expect, it } from 'vitest'

import {
  selectEffectiveEntitlement,
  shouldReleaseCustomDomains,
  subscriptionGrantsEntitlement,
} from './billing-entitlement.policy'

describe('billing entitlement policy', () => {
  it('does not grant billing-retry access without an explicit grace period', () => {
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

  it('releases custom domains only when a paid tenant lands back on free', () => {
    expect(shouldReleaseCustomDomains('pro', 'free')).toBe(true)
    expect(shouldReleaseCustomDomains('free', 'free')).toBe(false)
    expect(shouldReleaseCustomDomains('pro', 'pro')).toBe(false)
    expect(shouldReleaseCustomDomains(null, 'free')).toBe(false)
  })
})
