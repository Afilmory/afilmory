import type { AuthStatus } from '@/modules/auth/sessionStore'

export type AppTabName = 'photos' | 'map' | 'explore' | 'studio'

const AUTHENTICATED_TABS: readonly AppTabName[] = ['photos', 'map', 'explore', 'studio']
const SIGNED_OUT_TABS: readonly AppTabName[] = ['explore']

export function getAvailableTabNames(status: AuthStatus, workspaceReady = true): readonly AppTabName[] {
  if (status === 'signedIn' && workspaceReady) {
    return AUTHENTICATED_TABS
  }
  if (status === 'signedOut' || status === 'signedIn') {
    return SIGNED_OUT_TABS
  }
  return []
}

export function getDefaultTabPath(status: AuthStatus, workspaceReady = true): '/photos' | '/explore' | null {
  if (status === 'signedIn' && workspaceReady) {
    return '/photos'
  }
  if (status === 'signedOut' || status === 'signedIn') {
    return '/explore'
  }
  return null
}

export function shouldShowTabBar(status: AuthStatus): boolean {
  return status === 'signedIn'
}
