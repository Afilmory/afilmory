import type { SchemaFormValue, UiSchema } from '../schema-form/types'

export type SuperAdminSettingField = string

export type SuperAdminSettings = Record<SuperAdminSettingField, SchemaFormValue | undefined>

export interface SuperAdminStats {
  totalUsers: number
  registrationsRemaining: number | null
}

type SuperAdminSettingsResponseShape = {
  schema: UiSchema<SuperAdminSettingField>
  stats: SuperAdminStats
}

export type SuperAdminSettingsResponse =
  | (SuperAdminSettingsResponseShape & {
      values: SuperAdminSettings
      settings?: never
    })
  | (SuperAdminSettingsResponseShape & {
      settings: SuperAdminSettings
      values?: never
    })

export type UpdateSuperAdminSettingsPayload = Partial<
  Record<SuperAdminSettingField, SchemaFormValue | null | undefined>
>
