import { coreApi } from '~/lib/api-client'

import type { OnboardingSettingKey, OnboardingSiteSettingKey } from './constants'

export type OnboardingStatusResponse = {
  initialized: boolean
}

export type OnboardingInitPayload = {
  admin: {
    email: string
    password: string
    name: string
  }
  tenant: {
    name: string
    slug: string
  }
  settings?: Array<{
    key: OnboardingSettingKey | OnboardingSiteSettingKey
    value: unknown
  }>
}

export type OnboardingInitResponse = {
  ok: boolean
  adminUserId: string
  tenantId: string
  superAdminUserId: string
}

export async function getOnboardingStatus() {
  return await coreApi<OnboardingStatusResponse>('/onboarding/status', {
    method: 'GET',
  })
}

export async function getOnboardingSiteSchema() {
  return await coreApi('/onboarding/site-schema', {
    method: 'GET',
  })
}

export async function postOnboardingInit(payload: OnboardingInitPayload) {
  return await coreApi<OnboardingInitResponse>('/onboarding/init', {
    method: 'POST',
    body: payload,
  })
}
