export const STORAGE_PROVIDERS_SETTING_KEY = 'builder.storage.providers'
export const STORAGE_ACTIVE_PROVIDER_SETTING_KEY = 'builder.storage.activeProvider'

export const MANAGED_STORAGE_PROVIDER_ID = 'managed'

export const STORAGE_SETTING_KEYS = [STORAGE_PROVIDERS_SETTING_KEY, STORAGE_ACTIVE_PROVIDER_SETTING_KEY] as const

export type StorageSettingKey = (typeof STORAGE_SETTING_KEYS)[number]

export const STORAGE_PROVIDER_SENSITIVE_FIELDS: Record<string, readonly string[]> = {
  s3: ['secretAccessKey'],
  oss: ['secretAccessKey'],
  cos: ['secretAccessKey'],
  github: ['token'],
  b2: ['applicationKey'],
}
