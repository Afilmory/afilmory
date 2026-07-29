import { ofetch } from 'ofetch'

import { API_BASE_URL } from '@/api/client'

import { camelCaseKeys } from './case'
import type { SessionInfo, SessionTenant, SessionUser } from './types'

interface SessionResponse {
  user?: SessionUser | null
  tenant?: SessionTenant | null
}

export async function fetchSession(cookie: string | null): Promise<SessionInfo | null> {
  const raw = await ofetch<unknown>(`${API_BASE_URL}/auth/session`, {
    headers: cookie ? { cookie } : undefined,
  })
  if (!raw) {
    return null
  }
  const data = camelCaseKeys<SessionResponse>(raw)
  if (!data.user) {
    return null
  }
  return { user: data.user, tenant: data.tenant ?? null }
}
