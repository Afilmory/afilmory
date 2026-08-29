import type { CleanupCriteria } from '@afilmory/db'

export type CleanupSubjectType = 'tenant' | 'user'
export type CleanupMode = 'suspend' | 'delete'

export const DEFAULT_CLEANUP_CRITERIA: CleanupCriteria = {
  inactiveMonths: 3,
  maxPhotos: 0,
  maxStorageMb: 0,
  onlyReported: false,
  minSuspendedDays: 14,
}

export interface CleanupCandidate {
  subjectType: CleanupSubjectType
  id: string
  label: string
  secondaryLabel: string | null
  ownerName: string | null
  ownerEmail: string | null
  workspaceCount: number | null
  createdAt: string
  lastActivityAt: string
  photoCount: number
  storageBytes: number
  reportCount: number
}

export function buildCleanupConfirmation(mode: CleanupMode, subjectType: CleanupSubjectType, count: number): string {
  const verb = mode === 'suspend' ? 'SUSPEND' : 'DELETE'
  const noun = subjectType === 'tenant' ? 'TENANTS' : 'USERS'
  return `${verb} ${count} ${noun}`
}

export function calculateInactiveCutoff(reference: Date, inactiveMonths: number): Date {
  const cutoff = new Date(reference)
  const originalDay = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - inactiveMonths)
  const lastDayOfTargetMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
  return cutoff
}

const TIMESTAMP_ZONE_SUFFIX = /(?:z|[+-]\d{2}:?\d{2})$/i

// Postgres `timestamp` columns come back as '2026-08-01 00:00:00' with no zone marker; the
// stored value is UTC, so the bare string must not be parsed as local time.
export function parseDbTimestamp(value: string | Date): Date {
  if (value instanceof Date) {
    return value
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const hasZone = TIMESTAMP_ZONE_SUFFIX.test(normalized)
  return new Date(hasZone ? normalized : `${normalized}Z`)
}

export function calculateDeletionDueAt(suspendedAt: string | Date, minSuspendedDays: number): Date {
  return new Date(parseDbTimestamp(suspendedAt).getTime() + minSuspendedDays * 24 * 60 * 60 * 1000)
}

export function isDeletionDue(suspendedAt: string | Date, minSuspendedDays: number, now: Date): boolean {
  return calculateDeletionDueAt(suspendedAt, minSuspendedDays).getTime() <= now.getTime()
}

export function hasReactivatedSince(suspendedAt: string | Date, lastActivityAt: string | Date | null): boolean {
  if (!lastActivityAt) {
    return false
  }
  return parseDbTimestamp(lastActivityAt).getTime() > parseDbTimestamp(suspendedAt).getTime()
}

export function normalizeCriteria(input: Partial<CleanupCriteria> | null | undefined): CleanupCriteria {
  return { ...DEFAULT_CLEANUP_CRITERIA, ...(input ?? {}) }
}
