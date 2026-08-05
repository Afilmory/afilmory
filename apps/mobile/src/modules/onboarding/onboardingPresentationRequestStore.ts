import { useSyncExternalStore } from 'react'

import { refreshMobileOnboarding } from './onboardingStore'

let requestVersion = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): number {
  return requestVersion
}

export function requestMobileOnboardingPresentation(): void {
  requestVersion += 1
  for (const listener of listeners) {
    listener()
  }
  void refreshMobileOnboarding()
}

export function useMobileOnboardingPresentationRequest(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
