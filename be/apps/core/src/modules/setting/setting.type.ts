import type { settings } from '@afilmory/db'
import type { z } from 'zod'

import type {
  UiFieldComponentDefinition,
  UiFieldComponentType,
  UiFieldNode,
  UiGroupNode,
  UiSchema,
  UiSectionNode,
} from '../ui-schema/ui-schema.type'
import type { DEFAULT_SETTING_DEFINITIONS } from './setting.constant'

export type SettingDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  readonly isSensitive: boolean
  readonly schema: Schema
}

export type SettingMetadata = Pick<SettingDefinition, 'isSensitive'>

export type SettingRecord = typeof settings.$inferSelect

export type SettingKeyType = keyof typeof DEFAULT_SETTING_DEFINITIONS

export type SettingValueMap = {
  [K in SettingKeyType]: z.infer<(typeof DEFAULT_SETTING_DEFINITIONS)[K]['schema']>
}

export type SettingValueType = SettingValueMap[SettingKeyType]

export type SettingComponentType = UiFieldComponentType

export type SettingFieldComponentDefinition = UiFieldComponentDefinition<SettingKeyType>

export interface SettingFieldNode extends UiFieldNode<SettingKeyType> {
  readonly isSensitive: boolean
}

export interface SettingGroupNode extends UiGroupNode<SettingKeyType> {}

export interface SettingSectionNode extends UiSectionNode<SettingKeyType> {}

export type SettingNode = SettingSectionNode | SettingGroupNode | SettingFieldNode

export interface SettingUiSchema extends UiSchema<SettingKeyType> {}

export interface SettingUiSchemaResponse {
  readonly schema: SettingUiSchema
  readonly values: Partial<Record<SettingKeyType, SettingValueType | null>>
}
