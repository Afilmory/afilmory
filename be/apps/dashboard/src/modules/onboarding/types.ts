import type { SchemaFormState } from '~/modules/schema-form/types'

import type { OnboardingSettingKey, OnboardingSiteSettingKey } from './constants'

export type TenantFormState = {
  name: string
  slug: string
}

export type AdminFormState = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export type SettingFormState = Record<
  OnboardingSettingKey,
  {
    enabled: boolean
    value: string
  }
>

export type SiteFormState = SchemaFormState<OnboardingSiteSettingKey>

export type OnboardingErrors = Record<string, string>
