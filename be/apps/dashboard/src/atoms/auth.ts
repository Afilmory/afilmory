import { atom } from 'jotai'

import { createAtomHooks } from '~/lib/jotai'
import type { BetterAuthUser } from '~/modules/auth/types'

const baseAuthUserAtom = atom<BetterAuthUser | null>(null)

export const [authUserAtom, useAuthUser, useAuthUserValue, useSetAuthUser, getAuthUser, setAuthUser] =
  createAtomHooks(baseAuthUserAtom)

// Selectors
export function useIsAuthenticated() {
  const user = useAuthUserValue()
  return !!user
}

export function useUserRole() {
  const user = useAuthUserValue()
  return user?.role ?? null
}

export function useIsAdmin() {
  const user = useAuthUserValue()
  return user?.role === 'admin' || user?.role === 'superadmin'
}

export function useIsSuperAdmin() {
  const user = useAuthUserValue()
  return user?.role === 'superadmin'
}
