import type { FetchResponse } from 'ofetch'

import { coreApi } from '~/lib/api-client'

export interface RegisterTenantAccountPayload {
  email: string
  password: string
  name: string
}

export interface RegisterTenantPayload {
  account: RegisterTenantAccountPayload
  tenant: {
    name: string
    slug: string | null
  }
  settings?: Array<{
    key: string
    value: unknown
  }>
}

export type RegisterTenantResult = FetchResponse<unknown>

export async function registerTenant(payload: RegisterTenantPayload): Promise<RegisterTenantResult> {
  return await coreApi.raw('/auth/sign-up/email', {
    method: 'POST',
    body: payload,
  })
}
