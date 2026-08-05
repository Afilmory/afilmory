import { useSyncExternalStore } from 'react'

import { fetchMobileOnboardingReadiness } from './api'
import type { MobileOnboardingReadiness } from './types'

export type MobileOnboardingStatus = 'error' | 'idle' | 'loaded' | 'loading'

export interface MobileOnboardingSnapshot {
  error: string | null
  readiness: MobileOnboardingReadiness | null
  status: MobileOnboardingStatus
}

let snapshot: MobileOnboardingSnapshot = { error: null, readiness: null, status: 'idle' }
let requestGeneration = 0
let inFlight: Promise<MobileOnboardingReadiness | null> | null = null
const listeners = new Set<() => void>()

function emit(next: MobileOnboardingSnapshot) {
  snapshot = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): MobileOnboardingSnapshot {
  return snapshot
}

export function useMobileOnboarding(): MobileOnboardingSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function resetMobileOnboarding(): void {
  requestGeneration += 1
  inFlight = null
  emit({ error: null, readiness: null, status: 'idle' })
}

export async function refreshMobileOnboarding(): Promise<MobileOnboardingReadiness | null> {
  if (inFlight) {
    return await inFlight
  }
  const generation = ++requestGeneration
  emit({ ...snapshot, error: null, status: 'loading' })
  inFlight = fetchMobileOnboardingReadiness()
    .then((readiness) => {
      if (generation === requestGeneration) {
        emit({ error: null, readiness, status: 'loaded' })
      }
      return readiness
    })
    .catch((error: unknown) => {
      if (generation === requestGeneration) {
        emit({
          error: error instanceof Error ? error.message : 'MOBILE_ONBOARDING_READINESS_FAILED',
          readiness: snapshot.readiness,
          status: 'error',
        })
      }
      return null
    })
    .finally(() => {
      if (generation === requestGeneration) {
        inFlight = null
      }
    })
  return await inFlight
}

export function isMobileWorkspaceReady(value: MobileOnboardingSnapshot): boolean {
  return value.status === 'loaded' && value.readiness?.state === 'ready'
}
