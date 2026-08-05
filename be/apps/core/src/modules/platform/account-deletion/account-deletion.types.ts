export type AccountDeletionWorkspaceAction = 'delete' | 'transfer'
export type AccountDeletionProofMethod = 'apple' | 'password' | 'recent-session'

export interface AccountDeletionTransferTarget {
  email: string
  name: string
  role: 'admin' | 'member'
  userId: string
}

export interface AccountDeletionWorkspaceImpact {
  action: AccountDeletionWorkspaceAction
  name: string
  slug: string
  tenantId: string
  transferTo: AccountDeletionTransferTarget | null
}

export interface AccountDeletionSubscriptionImpact {
  id: string
  provider: 'app_store' | 'creem'
  requiresExternalCancellation: boolean
  status: string
  subscriptionId: string | null
  tenantId: string | null
}

export interface AccountDeletionImpact {
  joinedWorkspaces: Array<{ name: string, slug: string, tenantId: string }>
  proofMethods: AccountDeletionProofMethod[]
  subscriptions: AccountDeletionSubscriptionImpact[]
  workspaces: AccountDeletionWorkspaceImpact[]
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
