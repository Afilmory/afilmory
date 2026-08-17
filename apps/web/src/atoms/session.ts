import { atom } from 'jotai'

import type { SessionMembership, SessionUser } from '~/lib/api/auth'

export const sessionUserAtom = atom<SessionUser | null>(null)
export const sessionMembershipAtom = atom<SessionMembership | null>(null)
