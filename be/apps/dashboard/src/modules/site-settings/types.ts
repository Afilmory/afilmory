import type { SchemaFormValue, UiSchema } from '../schema-form/types'

export interface SiteSettingUiSchemaResponse<Key extends string = string> {
  readonly schema: UiSchema<Key>
  readonly values: Partial<Record<Key, string | null>>
}

export type SiteSettingValueState<Key extends string = string> = Record<Key, SchemaFormValue | undefined>

export type SiteSettingEntryInput<Key extends string = string> = {
  readonly key: Key
  readonly value: string
}

export interface SiteAuthorProfile {
  id: string
  name: string
  email: string
  username: string | null
  displayUsername: string | null
  avatar: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateSiteAuthorPayload = {
  name: string
  displayUsername?: string | null
  username?: string | null
  avatar?: string | null
}

export type TenantDomain = {
  id: string
  tenantId: string
  domain: string
  status: 'pending' | 'verified' | 'disabled'
  verificationToken: string
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}
