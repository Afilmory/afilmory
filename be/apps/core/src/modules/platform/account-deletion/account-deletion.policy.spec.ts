import { describe, expect, it } from 'vitest'

import { requiresExternalSubscriptionCancellation, selectOwnerSuccessor } from './account-deletion.policy'

function candidate(userId: string, role: 'admin' | 'member' | 'owner', createdAt: string, status = 'active') {
  return { createdAt, email: `${userId}@example.com`, name: userId, role, status, userId }
}

describe('account deletion owner succession', () => {
  it('selects the oldest active administrator before an older member', () => {
    const successor = selectOwnerSuccessor(
      [
        candidate('deleting', 'owner', '2024-01-01T00:00:00.000Z'),
        candidate('member', 'member', '2024-01-02T00:00:00.000Z'),
        candidate('admin', 'admin', '2024-02-01T00:00:00.000Z'),
      ],
      'deleting',
    )
    expect(successor?.userId).toBe('admin')
  })

  it('ignores the deleting owner and inactive memberships', () => {
    const successor = selectOwnerSuccessor(
      [
        candidate('deleting', 'owner', '2024-01-01T00:00:00.000Z'),
        candidate('suspended-admin', 'admin', '2024-01-02T00:00:00.000Z', 'suspended'),
        candidate('active-member', 'member', '2024-03-01T00:00:00.000Z'),
      ],
      'deleting',
    )
    expect(successor?.userId).toBe('active-member')
  })

  it('uses user ID as a stable tie breaker and returns null without a candidate', () => {
    expect(
      selectOwnerSuccessor(
        [
          candidate('member-b', 'member', '2024-01-01T00:00:00.000Z'),
          candidate('member-a', 'member', '2024-01-01T00:00:00.000Z'),
        ],
        'deleting',
      )?.userId,
    ).toBe('member-a')
    expect(selectOwnerSuccessor([candidate('deleting', 'owner', '2024-01-01T00:00:00.000Z')], 'deleting')).toBeNull()
  })
})

describe('account deletion subscription boundary', () => {
  it('requires the user to manage an active App Store subscription through Apple', () => {
    expect(requiresExternalSubscriptionCancellation('app_store', 'active')).toBe(true)
    expect(requiresExternalSubscriptionCancellation('app_store', 'grace_period')).toBe(true)
  })

  it('does not claim external action for Creem or terminal App Store subscriptions', () => {
    expect(requiresExternalSubscriptionCancellation('creem', 'active')).toBe(false)
    expect(requiresExternalSubscriptionCancellation('app_store', 'expired')).toBe(false)
    expect(requiresExternalSubscriptionCancellation('app_store', 'revoked')).toBe(false)
  })
})
