export type MobileOnboardingState
  = | 'owner_action_required'
    | 'purchase_pending'
    | 'ready'
    | 'storage_recovery'
    | 'storage_required'
    | 'workspace_required'

export interface MobileOnboardingFacts {
  hasByoStorage: boolean
  hasManagedStorage: boolean
  hasRecoverableManagedHistory: boolean
  membershipRole: 'admin' | 'member' | 'owner' | null
  purchasePending: boolean
  workspaceId: string | null
}

export function deriveMobileOnboardingState(facts: MobileOnboardingFacts): MobileOnboardingState {
  if (!facts.workspaceId || !facts.membershipRole) {
    return 'workspace_required'
  }
  if (facts.hasByoStorage || facts.hasManagedStorage) {
    return 'ready'
  }
  if (facts.purchasePending) {
    return 'purchase_pending'
  }
  if (facts.membershipRole === 'member') {
    return 'owner_action_required'
  }
  if (facts.hasRecoverableManagedHistory) {
    return 'storage_recovery'
  }
  return 'storage_required'
}
