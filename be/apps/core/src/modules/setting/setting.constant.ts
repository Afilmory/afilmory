import { z } from 'zod'

import type { SettingDefinition, SettingMetadata } from './setting.type'
import { STORAGE_PROVIDER_VALUES, StorageConfigRecordSchema, StorageConfigSchema } from './storage.schema'

function createJsonStringSchema(schema: z.ZodTypeAny, message: string) {
  return z.string().refine((value) => {
    try {
      const parsed = JSON.parse(value)
      return schema.safeParse(parsed).success
    } catch {
      return false
    }
  }, message)
}

export const DEFAULT_SETTING_DEFINITIONS = {
  'storage.activeProvider': {
    isSensitive: false,
    schema: z.enum(STORAGE_PROVIDER_VALUES),
  },
  'storage.providerConfig': {
    isSensitive: true,
    schema: createJsonStringSchema(StorageConfigSchema, 'Storage provider configuration must be a valid JSON object'),
  },
  'storage.providerConfigs': {
    isSensitive: true,
    schema: createJsonStringSchema(
      StorageConfigRecordSchema,
      'Storage provider configuration map must be a valid JSON object',
    ),
  },
  'ai.openai.apiKey': {
    isSensitive: true,
    schema: z.string().min(1, 'OpenAI API key cannot be empty'),
  },
  'ai.openai.baseUrl': {
    isSensitive: false,
    schema: z.url('OpenAI Base URL cannot be empty'),
  },
  'ai.embedding.model': {
    isSensitive: false,
    schema: z.string().min(1, 'AI Model name cannot be empty'),
  },
  'auth.google.clientId': {
    isSensitive: false,
    schema: z.string().min(1, 'Google Client ID cannot be empty'),
  },
  'auth.google.clientSecret': {
    isSensitive: true,
    schema: z.string().min(1, 'Google Client secret cannot be empty'),
  },
  'auth.github.clientId': {
    isSensitive: false,
    schema: z.string().min(1, 'GitHub Client ID cannot be empty'),
  },
  'auth.github.clientSecret': {
    isSensitive: true,
    schema: z.string().min(1, 'GitHub Client secret cannot be empty'),
  },
  'http.cors.allowedOrigins': {
    isSensitive: false,
    schema: z
      .string()
      .min(1, 'CORS allowed origins cannot be empty')
      .transform((value) => value.trim()),
  },
  'services.amap.apiKey': {
    isSensitive: true,
    schema: z.string().min(1, 'Gaode Map API key cannot be empty'),
  },
} as const satisfies Record<string, SettingDefinition>

export const DEFAULT_SETTING_METADATA = Object.fromEntries(
  Object.entries(DEFAULT_SETTING_DEFINITIONS).map(([key, definition]) => [
    key,
    { isSensitive: definition.isSensitive } satisfies SettingMetadata,
  ]),
) as Record<keyof typeof DEFAULT_SETTING_DEFINITIONS, SettingMetadata>

const settingKeys = Object.keys(DEFAULT_SETTING_DEFINITIONS) as Array<keyof typeof DEFAULT_SETTING_DEFINITIONS>

export const SettingKeys = settingKeys as [
  keyof typeof DEFAULT_SETTING_DEFINITIONS,
  ...Array<keyof typeof DEFAULT_SETTING_DEFINITIONS>,
]

export const SETTING_SCHEMAS = Object.fromEntries(
  Object.entries(DEFAULT_SETTING_DEFINITIONS).map(([key, definition]) => [key, definition.schema]),
) as Record<
  keyof typeof DEFAULT_SETTING_DEFINITIONS,
  (typeof DEFAULT_SETTING_DEFINITIONS)[keyof typeof DEFAULT_SETTING_DEFINITIONS]['schema']
>

export const AES_ALGORITHM = 'aes-256-gcm'
export const IV_LENGTH = 12
export const AUTH_TAG_LENGTH = 16
