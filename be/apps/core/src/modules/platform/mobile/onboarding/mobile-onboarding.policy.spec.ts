import { describe, expect, it } from 'vitest'

import { deriveMobileOnboardingState } from './mobile-onboarding.policy'

const base = {
  hasByoStorage: false,
  hasManagedStorage: false,
  hasRecoverableManagedHistory: false,
  membershipRole: 'owner' as const,
  purchasePending: false,
  workspaceId: 'tenant-1',
}

describe('mobile onboarding readiness', () => {
  it('requires workspace creation when the signed-in identity has no active membership', () => {
    expect(
      deriveMobileOnboardingState({
        ...base,
        membershipRole: null,
        workspaceId: null,
      }),
    ).toBe('workspace_required')
  })

  it('requires only storage after workspace creation', () => {
    expect(deriveMobileOnboardingState(base)).toBe('storage_required')
  })

  it('recognizes either managed or bring-your-own storage as ready', () => {
    expect(deriveMobileOnboardingState({ ...base, hasManagedStorage: true })).toBe('ready')
    expect(deriveMobileOnboardingState({ ...base, hasByoStorage: true })).toBe('ready')
  })

  it('keeps an expired managed workspace in recovery unless BYO is active', () => {
    expect(deriveMobileOnboardingState({ ...base, hasRecoverableManagedHistory: true })).toBe('storage_recovery')
    expect(deriveMobileOnboardingState({ ...base, hasByoStorage: true, hasRecoverableManagedHistory: true })).toBe(
      'ready',
    )
  })

  it('directs members to an owner without blocking public application access', () => {
    expect(deriveMobileOnboardingState({ ...base, membershipRole: 'member' })).toBe('owner_action_required')
  })
})
