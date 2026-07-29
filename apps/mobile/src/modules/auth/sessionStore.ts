import { useSyncExternalStore } from 'react'

import { setAuthCookie } from '@/api/auth'

import { fetchSession } from './api'
import { authClient } from './authClient'
import type { AuthProviderId, SessionInfo } from './types'

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export interface AuthState {
  status: AuthStatus
  session: SessionInfo | null
}

let state: AuthState = { status: 'loading', session: null }
const listeners = new Set<() => void>()

function setState(next: AuthState) {
  state = next
  for (const listener of listeners) {
    listener()
  }
}

function getSnapshot(): AuthState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function resetToSignedOut() {
  setAuthCookie(null)
  setState({ status: 'signedOut', session: null })
}

export async function hydrateAuth(): Promise<void> {
  try {
    const cookie = authClient.getCookie()
    if (!cookie) {
      resetToSignedOut()
      return
    }
    const session = await fetchSession(cookie)
    if (!session) {
      resetToSignedOut()
      return
    }
    setAuthCookie(cookie)
    setState({ status: 'signedIn', session })
  }
  catch {
    resetToSignedOut()
  }
}

export async function signInWithProvider(provider: AuthProviderId): Promise<void> {
  const result = await authClient.signIn.social({ provider, callbackURL: '/' })
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign-in failed.')
  }
  const cookie = authClient.getCookie()
  const session = await fetchSession(cookie)
  if (!session) {
    throw new Error('Sign-in did not produce a session.')
  }
  setAuthCookie(cookie)
  setState({ status: 'signedIn', session })
}

export async function signOut(): Promise<void> {
  await authClient.signOut().catch(() => {})
  resetToSignedOut()
}
