export type AuthProviderId = 'github' | 'google'

export interface SessionUser {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
}

export interface SessionTenant {
  id: string
  slug: string
  name: string
  status: string
  isPlaceholder?: boolean
}

export interface SessionInfo {
  user: SessionUser
  tenant: SessionTenant | null
}
