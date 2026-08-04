export type AuthProviderId = 'github' | 'google'

export type AccountDeletionProofMethod = 'apple' | 'password' | 'recent-session'

export interface AccountDeletionTransferTarget {
  email: string
  name: string
  role: 'admin' | 'member'
  userId: string
}

export interface AccountDeletionImpact {
  joinedWorkspaces: Array<{ name: string, slug: string, tenantId: string }>
  proofMethods: AccountDeletionProofMethod[]
  subscriptions: Array<{
    id: string
    status: string
    subscriptionId: string | null
    tenantId: string | null
  }>
  workspaces: Array<{
    action: 'delete' | 'transfer'
    name: string
    slug: string
    tenantId: string
    transferTo: AccountDeletionTransferTarget | null
  }>
}

export type AccountDeletionProof
  = | { password: string, type: 'password' }
    | { identityToken: string, nonce: string, type: 'apple' }
    | { type: 'recent-session' }

export interface AccountDeletionRequestResult {
  requestId: string
  status: 'requested'
  statusToken: string
}

export interface SessionUser {
  id: string
  name: string
  email: string
  image?: string | null
  role?: 'user' | 'superadmin' | null
}

export interface SessionWorkspace {
  id: string
  slug: string
  name: string
  status: string
  isPlaceholder?: boolean
}

export interface SessionMembership {
  id: string
  role: 'member' | 'admin' | 'owner'
  status: 'active' | 'suspended'
  workspace: SessionWorkspace
}

export interface SessionInfo {
  user: SessionUser
  activeWorkspace: SessionWorkspace | null
  requestedWorkspace: SessionWorkspace | null
  requestedMembership: Omit<SessionMembership, 'workspace'> | null
  memberships: SessionMembership[]
  activeMembership: SessionMembership | null
}
