import { useSyncExternalStore } from 'react'

import { adoptAuthCookie, setAuthCookie } from '@/api/auth'
import { setActiveTenantSlug } from '@/api/client'
import type { NativeSessionSnapshot } from '@/native/afilmorySession'
import { addNativeSessionListener, getNativeSessionSnapshot } from '@/native/afilmorySession'

import {
  createWorkspace,
  exchangeAppleAuthorization,
  fetchAccountDeletionImpact,
  fetchSession,
  requestAccountDeletion,
  switchActiveWorkspace,
} from './api'
import { requestAppleAuthorization } from './appleAuthentication'
import { getAuthClient } from './authClient'
import { clearAuthStorage } from './authStorage'
import type {
  AccountDeletionImpact,
  AccountDeletionProof,
  AccountDeletionRequestResult,
  AuthProviderId,
  SessionInfo,
} from './types'

export type AuthStatus = 'failed' | 'loading' | 'signedIn' | 'signedOut'

export interface AuthState {
  status: AuthStatus
  session: SessionInfo | null
  error?: string
}

let state: AuthState = { status: 'loading', session: null }
let mirroringNativeSession = false
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

function setActiveWorkspace(slug: string | null | undefined): void {
  setActiveTenantSlug(slug)
}

function resetToSignedOut() {
  setAuthCookie(null)
  setActiveWorkspace(null)
  setState({ status: 'signedOut', session: null })
}

function setSignedIn(session: SessionInfo, cookie: string | null) {
  setAuthCookie(cookie)
  setActiveWorkspace(session.activeWorkspace?.slug)
  setState({ status: 'signedIn', session })
}

function mirrorNativeSession(snapshot: NativeSessionSnapshot): void {
  if (snapshot.status === 'signedIn') {
    if (!snapshot.session) {
      return
    }
    adoptAuthCookie(getAuthClient().getCookie())
    setActiveWorkspace(snapshot.session.activeWorkspace?.slug)
    setState({ status: 'signedIn', session: snapshot.session })
    return
  }

  if (snapshot.status === 'signedOut') {
    adoptAuthCookie(null)
    setActiveWorkspace(null)
    setState({ status: 'signedOut', session: null })
    return
  }

  // A failed refresh never downgrades a session an interactive flow already established.
  if (snapshot.status === 'failed' && state.status !== 'signedIn') {
    setState({ status: 'failed', session: null, error: snapshot.error })
  }
}

export function hydrateAuth(): void {
  if (!mirroringNativeSession) {
    mirroringNativeSession = true
    addNativeSessionListener(mirrorNativeSession)
  }
  const snapshot = getNativeSessionSnapshot()
  if (snapshot) {
    mirrorNativeSession(snapshot)
  }
}

export async function signInWithProvider(provider: AuthProviderId): Promise<void> {
  const result = await getAuthClient().signIn.social({ provider, callbackURL: '/' })
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign-in failed.')
  }
  const cookie = getAuthClient().getCookie()
  const session = await fetchSession(cookie)
  if (!session) {
    throw new Error('Sign-in did not produce a session.')
  }
  setSignedIn(session, cookie)
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const result = await getAuthClient().signIn.email({ email, password })
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign-in failed.')
  }
  const cookie = getAuthClient().getCookie()
  const session = await fetchSession(cookie)
  if (!session) {
    throw new Error('Sign-in did not produce a session.')
  }
  setSignedIn(session, cookie)
}

export async function signInWithApple(): Promise<void> {
  const authorization = await requestAppleAuthorization()
  const result = await getAuthClient().signIn.social({
    callbackURL: '/',
    idToken: {
      nonce: authorization.nonce,
      token: authorization.identityToken,
      user: {
        email: authorization.email ?? undefined,
        name: authorization.name,
      },
    },
    provider: 'apple',
    requestSignUp: true,
  })
  if (result.error) {
    throw new Error(result.error.message ?? 'Sign in with Apple failed.')
  }

  const cookie = getAuthClient().getCookie()
  if (!cookie) {
    throw new Error('Sign in with Apple did not produce a session.')
  }
  try {
    await exchangeAppleAuthorization(cookie, authorization)
    const session = await fetchSession(cookie)
    if (!session) {
      throw new Error('Sign in with Apple did not produce a session.')
    }
    setSignedIn(session, cookie)
  }
  catch (error) {
    await clearLocalAuthentication()
    throw error
  }
}

export async function signOut(): Promise<void> {
  await getAuthClient()
    .signOut()
    .catch(() => {})
  await clearLocalAuthentication()
}

export async function clearLocalAuthentication(): Promise<void> {
  await clearAuthStorage()
  resetToSignedOut()
}

export async function createInitialWorkspace(name: string, slug: string): Promise<void> {
  const cookie = getAuthClient().getCookie()
  if (!cookie) {
    resetToSignedOut()
    throw new Error('A valid session is required to create a workspace.')
  }
  await createWorkspace(cookie, { name, slug })
  const session = await fetchSession(cookie)
  if (!session?.activeWorkspace) {
    throw new Error('The workspace was created, but the session could not be refreshed.')
  }
  setSignedIn(session, cookie)
}

export async function deleteAccount(proof: AccountDeletionProof): Promise<AccountDeletionRequestResult> {
  const cookie = getAuthClient().getCookie()
  if (!cookie) {
    resetToSignedOut()
    throw new Error('A valid session is required to delete this account.')
  }
  const result = await requestAccountDeletion(cookie, proof)
  await clearLocalAuthentication()
  return result
}

export async function loadAccountDeletionImpact(): Promise<AccountDeletionImpact> {
  const cookie = getAuthClient().getCookie()
  if (!cookie) {
    resetToSignedOut()
    throw new Error('A valid session is required to inspect account deletion impact.')
  }
  return await fetchAccountDeletionImpact(cookie)
}

export async function switchWorkspace(tenantId: string): Promise<void> {
  const cookie = getAuthClient().getCookie()
  if (!cookie) {
    resetToSignedOut()
    throw new Error('A valid session is required to switch workspaces.')
  }

  await switchActiveWorkspace(cookie, tenantId)
  const session = await fetchSession(cookie)
  if (!session) {
    resetToSignedOut()
    throw new Error('The session expired while switching workspaces.')
  }
  setSignedIn(session, cookie)
}

export function synchronizeWorkspaceFromNative(slug: string): void {
  setActiveWorkspace(slug)
}
