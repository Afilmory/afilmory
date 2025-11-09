import { coreApi } from '~/lib/api-client'

import type { BetterAuthSession, BetterAuthUser } from '../types'

export type SessionResponse = {
  user: BetterAuthUser
  session: BetterAuthSession
}

export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const

export async function fetchSession() {
  const session = await coreApi<SessionResponse>('/auth/session', { method: 'GET' })
  return session
}
