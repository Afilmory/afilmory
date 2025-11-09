export type BetterAuthUserRole = 'guest' | 'user' | 'admin' | 'superadmin'

export interface BetterAuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  tenantId: string | null
  role: BetterAuthUserRole
}

export interface BetterAuthSession {
  id: string
  expiresAt: string
  token: string
  userId: string
  tenantId: string | null
  createdAt: string
  refreshedAt: string
}

export interface AuthState {
  user: BetterAuthUser
  session: BetterAuthSession
}
