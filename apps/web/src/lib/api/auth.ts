import { apiFetch } from './http'

export interface SessionUser {
  id: string
  name?: string | null
  image?: string | null
  role?: string | null
}

export type WorkspaceMembershipRole = 'member' | 'admin' | 'owner'
export type WorkspaceMembershipStatus = 'active' | 'suspended'

export interface SessionMembership {
  id: string
  role: WorkspaceMembershipRole
  status: WorkspaceMembershipStatus
}

export interface SessionPayload {
  user: SessionUser
  session: unknown
  tenant?: unknown
  requestedMembership?: SessionMembership | null
}

export function canAccessDashboard(input: {
  user?: Pick<SessionUser, 'role'> | null
  requestedMembership?: SessionMembership | null
}): boolean {
  if (input.user?.role === 'superadmin') {
    return true
  }

  const membership = input.requestedMembership
  return membership?.status === 'active' && (membership.role === 'admin' || membership.role === 'owner')
}

export interface SocialProvider {
  id: string
  name: string
  icon: string
  callbackPath: string
}

export interface SocialProvidersResponse {
  providers: SocialProvider[]
}

export const authApi = {
  async getSession(): Promise<SessionPayload | null> {
    return await apiFetch<SessionPayload | null>('/api/auth/session')
  },
  async signOut(): Promise<void> {
    await apiFetch('/api/auth/sign-out', {
      method: 'POST',
    })
  },
  async getSocialProviders(): Promise<SocialProvidersResponse> {
    return await apiFetch<SocialProvidersResponse>('/api/auth/social/providers')
  },
  async signInSocial(provider: string): Promise<{ url: string }> {
    return await apiFetch<{ url: string }>('/api/auth/social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        disableRedirect: true,
        callbackURL: window.location.href,
      }),
    })
  },
}
