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
