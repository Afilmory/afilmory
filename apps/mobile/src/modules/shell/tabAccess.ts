import type { AuthStatus } from '@/modules/auth/sessionStore'

export type AppTabName = 'photos' | 'map' | 'explore' | 'studio'

const AUTHENTICATED_TABS: readonly AppTabName[] = ['photos', 'map', 'explore', 'studio']
const VISITOR_TABS: readonly AppTabName[] = ['explore']

// An unresolvable session browses as a visitor; it must never strand the app on a blank screen.
export function isVisitorStatus(status: AuthStatus): boolean {
  return status === 'signedOut' || status === 'failed'
}

export function getAvailableTabNames(status: AuthStatus): readonly AppTabName[] {
  if (status === 'signedIn') {
    return AUTHENTICATED_TABS
  }
  if (isVisitorStatus(status)) {
    return VISITOR_TABS
  }
  return []
}

export function getDefaultTabPath(status: AuthStatus): '/photos' | '/explore' | null {
  if (status === 'signedIn') {
    return '/photos'
  }
  if (isVisitorStatus(status)) {
    return '/explore'
  }
  return null
}

export function shouldShowTabBar(status: AuthStatus): boolean {
  return status === 'signedIn'
}
