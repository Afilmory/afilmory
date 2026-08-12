import type { BillingSubscriptionStatus } from '../billing-domain.types'

export interface ProjectableEntitlement {
  endsAt: string | null
  rank: number
  sourceType: 'manual' | 'subscription'
  startsAt: string
  value: string
}

export function subscriptionGrantsEntitlement(
  status: BillingSubscriptionStatus,
  periodEnd: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!['active', 'cancel_scheduled', 'grace_period', 'conflict'].includes(status)) {
    return false
  }
  if (!periodEnd) {
    return true
  }
  const end = new Date(periodEnd).getTime()
  return Number.isNaN(end) || end > now
}

export function shouldReleaseCustomDomains(previousPlanId: string | null | undefined, nextPlanId: string): boolean {
  if (previousPlanId === null || previousPlanId === undefined) {
    return false
  }
  return previousPlanId !== 'free' && nextPlanId === 'free'
}

export function selectEffectiveEntitlement(
  entitlements: readonly ProjectableEntitlement[],
  now = Date.now(),
): ProjectableEntitlement | null {
  const effective = entitlements.filter((entitlement) => {
    const startsAt = new Date(entitlement.startsAt).getTime()
    if (!Number.isNaN(startsAt) && startsAt > now) {
      return false
    }
    if (!entitlement.endsAt) {
      return true
    }
    const endsAt = new Date(entitlement.endsAt).getTime()
    return Number.isNaN(endsAt) || endsAt > now
  })

  effective.sort((left, right) => {
    const leftSource = left.sourceType === 'manual' ? 1 : 0
    const rightSource = right.sourceType === 'manual' ? 1 : 0
    if (leftSource !== rightSource) {
      return rightSource - leftSource
    }
    if (left.rank !== right.rank) {
      return right.rank - left.rank
    }
    return new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime()
  })

  return effective[0] ?? null
}
