import type { MobileOnboardingState } from './types'

export interface MobileOnboardingPresentationTarget {
  dismissible: boolean
  page: 'storage' | 'workspace'
}

export function isMobileOnboardingDismissible(state: MobileOnboardingState): boolean {
  return state !== 'workspace_required' && state !== 'storage_required'
}

export function resolveMobileOnboardingPresentation(
  state: MobileOnboardingState,
): MobileOnboardingPresentationTarget | null {
  if (state === 'ready') {
    return null
  }
  return {
    dismissible: isMobileOnboardingDismissible(state),
    page: state === 'workspace_required' ? 'workspace' : 'storage',
  }
}
