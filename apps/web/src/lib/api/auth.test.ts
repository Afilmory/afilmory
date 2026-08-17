import assert from 'node:assert/strict'
import test from 'node:test'

import { canAccessDashboard } from './auth'

test('canAccessDashboard allows workspace owners and admins', () => {
  assert.equal(
    canAccessDashboard({
      user: { role: 'user' },
      requestedMembership: { id: 'm1', role: 'owner', status: 'active' },
    }),
    true,
  )
  assert.equal(
    canAccessDashboard({
      user: { role: 'user' },
      requestedMembership: { id: 'm1', role: 'admin', status: 'active' },
    }),
    true,
  )
})

test('canAccessDashboard allows platform superadmins', () => {
  assert.equal(canAccessDashboard({ user: { role: 'superadmin' }, requestedMembership: null }), true)
})

test('canAccessDashboard hides the dashboard from members and guests', () => {
  assert.equal(
    canAccessDashboard({
      user: { role: 'user' },
      requestedMembership: { id: 'm1', role: 'member', status: 'active' },
    }),
    false,
  )
  assert.equal(
    canAccessDashboard({
      user: { role: 'user' },
      requestedMembership: { id: 'm1', role: 'owner', status: 'suspended' },
    }),
    false,
  )
  assert.equal(canAccessDashboard({ user: { role: 'user' }, requestedMembership: null }), false)
  assert.equal(canAccessDashboard({ user: null, requestedMembership: null }), false)
})
