import { describe, expect, it } from 'vitest'

import { canTargetUser, excludeBlockedAuthors } from './user-safety.policy'

describe('user safety policy', () => {
  it('prevents reporting or blocking the acting user', () => {
    expect(canTargetUser('viewer', 'viewer')).toBe(false)
    expect(canTargetUser('viewer', 'author')).toBe(true)
  })

  it('removes every record authored by a blocked user while retaining unrelated content', () => {
    const visible = excludeBlockedAuthors(
      [
        { id: 'one', userId: 'blocked' },
        { id: 'two', userId: 'visible' },
        { id: 'three', userId: 'blocked' },
      ],
      new Set(['blocked']),
      record => record.userId,
    )

    expect(visible.map(record => record.id)).toEqual(['two'])
  })
})
