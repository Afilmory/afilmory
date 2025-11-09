import { coreApi } from '~/lib/api-client'

export interface SocialAccountRecord {
  id: string
  providerId: string
  accountId: string
  createdAt: string
  updatedAt: string
  scopes: string[]
}

type RawSocialAccountRecord = {
  id: string
  providerId?: string
  provider_id?: string
  accountId?: string
  account_id?: string
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
  scopes?: string[]
}

export interface SocialAccountsResponse {
  accounts: RawSocialAccountRecord[]
}

export interface LinkSocialAccountPayload {
  provider: string
  callbackURL?: string
  errorCallbackURL?: string
  disableRedirect?: boolean
}

export interface SocialLinkResponse {
  url: string
  redirect: boolean
}

export interface UnlinkSocialAccountPayload {
  providerId: string
  accountId?: string
}

export async function fetchSocialAccounts(): Promise<SocialAccountRecord[]> {
  const response = await coreApi<SocialAccountsResponse>('/auth/social/accounts', {
    method: 'GET',
  })
  return response.accounts.map((element) => normalizeAccountRecord(element))
}

function normalizeAccountRecord(record: RawSocialAccountRecord): SocialAccountRecord {
  return {
    id: record.id,
    providerId: record.providerId ?? record.provider_id ?? '',
    accountId: record.accountId ?? record.account_id ?? '',
    createdAt: record.createdAt ?? record.created_at ?? '',
    updatedAt: record.updatedAt ?? record.updated_at ?? '',
    scopes: Array.isArray(record.scopes) ? record.scopes : [],
  }
}

export async function linkSocialAccount(payload: LinkSocialAccountPayload): Promise<SocialLinkResponse> {
  return await coreApi<SocialLinkResponse>('/auth/social/link', {
    method: 'POST',
    body: payload,
  })
}

export async function unlinkSocialAccount(payload: UnlinkSocialAccountPayload): Promise<void> {
  await coreApi<{ success: boolean }>('/auth/social/unlink', {
    method: 'POST',
    body: payload,
  })
}
