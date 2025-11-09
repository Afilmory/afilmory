import type { UiSchema } from '../ui-schema/ui-schema.type'
import type { SystemSettingField } from './system-setting.constants'

export interface SystemSettings {
  allowRegistration: boolean
  maxRegistrableUsers: number | null
  localProviderEnabled: boolean
  baseDomain: string
  oauthGoogleClientId: string | null
  oauthGoogleClientSecret: string | null
  oauthGoogleRedirectUri: string | null
  oauthGithubClientId: string | null
  oauthGithubClientSecret: string | null
  oauthGithubRedirectUri: string | null
}

export type SystemSettingValueMap = {
  [K in SystemSettingField]: SystemSettings[K]
}

export interface SystemSettingStats {
  totalUsers: number
  registrationsRemaining: number | null
}

export interface SystemSettingOverview {
  schema: UiSchema<SystemSettingField>
  values: SystemSettingValueMap
  stats: SystemSettingStats
}

export type UpdateSystemSettingsInput = Partial<SystemSettings>

export { type SystemSettingField } from './system-setting.constants'
