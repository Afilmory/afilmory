import { ofetch } from 'ofetch'

import { getApiBaseUrl } from '@/api/client'

import { camelCaseKeys } from './case'
import type {
  AccountDeletionImpact,
  AccountDeletionProof,
  AccountDeletionRequestResult,
  SessionInfo,
  SessionMembership,
  SessionUser,
  SessionWorkspace,
} from './types'

interface SessionResponse {
  user?: SessionUser | null
  activeWorkspace?: SessionWorkspace | null
  requestedWorkspace?: SessionWorkspace | null
  requestedMembership?: Omit<SessionMembership, 'workspace'> | null
  memberships?: SessionMembership[]
}

export interface AppleAuthenticationConfiguration {
  appBundleIdentifier: string
  enabled: boolean
  webEnabled: boolean
}

export async function fetchSession(cookie: string | null): Promise<SessionInfo | null> {
  const raw = await ofetch<unknown>(`${getApiBaseUrl()}/auth/session`, {
    headers: cookie ? { cookie } : undefined,
  })
  if (!raw) {
    return null
  }

  const data = camelCaseKeys<SessionResponse>(raw)
  if (!data.user) {
    return null
  }

  const memberships = data.memberships ?? []
  const activeWorkspace = data.activeWorkspace ?? null
  const activeMembership = activeWorkspace
    ? (memberships.find(
        membership => membership.status === 'active' && membership.workspace.id === activeWorkspace.id,
      ) ?? null)
    : null

  return {
    user: data.user,
    activeWorkspace,
    requestedWorkspace: data.requestedWorkspace ?? null,
    requestedMembership: data.requestedMembership ?? null,
    memberships,
    activeMembership,
  }
}

export async function switchActiveWorkspace(cookie: string | null, tenantId: string): Promise<void> {
  await ofetch(`${getApiBaseUrl()}/auth/workspaces/switch`, {
    method: 'POST',
    headers: cookie ? { cookie } : undefined,
    body: { tenantId },
  })
}

export async function exchangeAppleAuthorization(
  cookie: string,
  input: { authorizationCode: string, identityToken: string, nonce: string },
): Promise<void> {
  await ofetch(`${getApiBaseUrl()}/mobile-auth/apple/exchange`, {
    body: input,
    headers: { cookie },
    method: 'POST',
  })
}

export async function fetchAppleAuthenticationConfiguration(): Promise<AppleAuthenticationConfiguration> {
  const raw = await ofetch<unknown>(`${getApiBaseUrl()}/mobile-auth/apple/configuration`)
  return camelCaseKeys<AppleAuthenticationConfiguration>(raw)
}

export async function createWorkspace(cookie: string, input: { name: string, slug: string }): Promise<void> {
  await ofetch(`${getApiBaseUrl()}/auth/sign-up/email`, {
    body: {
      tenant: input,
      useSessionAccount: true,
    },
    headers: { cookie },
    method: 'POST',
  })
}

export async function fetchAccountDeletionImpact(cookie: string): Promise<AccountDeletionImpact> {
  const raw = await ofetch<unknown>(`${getApiBaseUrl()}/account-deletion/impact`, {
    headers: { cookie },
  })
  return camelCaseKeys<AccountDeletionImpact>(raw)
}

export async function requestAccountDeletion(
  cookie: string,
  proof: AccountDeletionProof,
): Promise<AccountDeletionRequestResult> {
  const raw = await ofetch<unknown>(`${getApiBaseUrl()}/account-deletion/request`, {
    body: { proof },
    headers: { cookie },
    method: 'POST',
  })
  return camelCaseKeys<AccountDeletionRequestResult>(raw)
}
