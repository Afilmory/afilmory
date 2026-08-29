import { describe, expect, it } from 'vitest'

import {
  buildCleanupConfirmation,
  calculateDeletionDueAt,
  calculateInactiveCutoff,
  hasReactivatedSince,
  isDeletionDue,
  normalizeCriteria,
  parseDbTimestamp,
} from './cleanup/cleanup.shared'
import { sanitizeAuditSnapshot } from './super-admin-audit.service'

describe('sanitizeAuditSnapshot', () => {
  it('strips sensitive keys at every depth', () => {
    expect(
      sanitizeAuditSnapshot({
        name: 'demo',
        password: 'secret',
        nested: [{ accessToken: 'x', keep: 1 }],
      }),
    ).toEqual({ name: 'demo', nested: [{ keep: 1 }] })
  })
})

describe('buildCleanupConfirmation', () => {
  it('encodes mode, subject and count', () => {
    expect(buildCleanupConfirmation('suspend', 'tenant', 12)).toBe('SUSPEND 12 TENANTS')
    expect(buildCleanupConfirmation('delete', 'user', 3)).toBe('DELETE 3 USERS')
  })
})

describe('calculateInactiveCutoff', () => {
  it('clamps to the last day of a shorter target month', () => {
    expect(calculateInactiveCutoff(new Date('2026-05-31T08:30:00.000Z'), 3).toISOString()).toBe(
      '2026-02-28T08:30:00.000Z',
    )
  })
})

describe('deletion gate', () => {
  const suspendedAt = '2026-08-01T00:00:00.000Z'

  it('holds until the suspension window elapses', () => {
    expect(calculateDeletionDueAt(suspendedAt, 14).toISOString()).toBe('2026-08-15T00:00:00.000Z')
    expect(isDeletionDue(suspendedAt, 14, new Date('2026-08-14T23:59:59.000Z'))).toBe(false)
    expect(isDeletionDue(suspendedAt, 14, new Date('2026-08-15T00:00:00.000Z'))).toBe(true)
  })

  it('treats activity after suspension as a reactivation', () => {
    expect(hasReactivatedSince(suspendedAt, '2026-08-02T00:00:00.000Z')).toBe(true)
    expect(hasReactivatedSince(suspendedAt, '2026-07-30T00:00:00.000Z')).toBe(false)
    expect(hasReactivatedSince(suspendedAt, null)).toBe(false)
  })
})

describe('parseDbTimestamp', () => {
  it('reads a zoneless postgres timestamp as UTC', () => {
    expect(parseDbTimestamp('2026-08-01 00:00:00').toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(parseDbTimestamp('2026-08-01T00:00:00.000Z').toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })

  it('keeps the due date stable regardless of host timezone', () => {
    expect(calculateDeletionDueAt('2026-08-01 00:00:00', 14).toISOString()).toBe('2026-08-15T00:00:00.000Z')
  })
})

describe('normalizeCriteria', () => {
  it('fills defaults and keeps overrides', () => {
    expect(normalizeCriteria({ maxPhotos: 5 })).toEqual({
      inactiveMonths: 3,
      maxPhotos: 5,
      maxStorageMb: 0,
      onlyReported: false,
      minSuspendedDays: 14,
    })
    expect(normalizeCriteria(null).minSuspendedDays).toBe(14)
  })
})
