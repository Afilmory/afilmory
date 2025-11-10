import type { systemSettings } from '@afilmory/db'

export type SystemSettingRecord = typeof systemSettings.$inferSelect
export type SystemSettingKey = SystemSettingRecord['key']

export type SystemSettingGetManyResult = Record<SystemSettingKey, SystemSettingRecord['value']>

export interface SystemSettingSetOptions {
  readonly isSensitive?: boolean
  readonly description?: string | null
}

export interface SystemSettingEntryInput {
  readonly key: SystemSettingKey
  readonly value: SystemSettingRecord['value']
  readonly options?: SystemSettingSetOptions
}
