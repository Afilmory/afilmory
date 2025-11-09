import { z } from 'zod'

import type { SettingDefinition, SettingMetadata } from './setting.type'

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}){1,2}$/i

function createOptionalUrlSchema(errorMessage: string) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        return
      }

      try {
        new URL(value)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: errorMessage,
        })
      }
    })
}

function createJsonStringArraySchema(options: {
  allowEmpty?: boolean
  validator?: (value: unknown) => boolean
  errorMessage: string
}) {
  return z.string().transform((value, ctx) => {
    const normalized = value.trim()

    if (normalized.length === 0) {
      if (options.allowEmpty) {
        return '[]'
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: options.errorMessage,
      })
      return z.NEVER
    }

    try {
      const parsed = JSON.parse(normalized)
      if (!Array.isArray(parsed) || (options.validator && !parsed.every(options.validator))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: options.errorMessage,
        })
        return z.NEVER
      }
      return JSON.stringify(parsed)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: options.errorMessage,
      })
      return z.NEVER
    }
  })
}

export const DEFAULT_SETTING_DEFINITIONS = {
  // 'ai.openai.apiKey': {
  //   isSensitive: true,
  //   schema: z.string().min(1, 'OpenAI API key cannot be empty'),
  // },
  // 'ai.openai.baseUrl': {
  //   isSensitive: false,
  //   schema: z.url('OpenAI Base URL cannot be empty'),
  // },
  // 'ai.embedding.model': {
  //   isSensitive: false,
  //   schema: z.string().min(1, 'AI Model name cannot be empty'),
  // },
  'builder.storage.providers': {
    isSensitive: false,
    schema: createJsonStringArraySchema({
      allowEmpty: true,
      errorMessage: 'Builder storage providers must be a JSON array',
    }),
  },
  'builder.storage.activeProvider': {
    isSensitive: false,
    schema: z.string().transform((value) => value.trim()),
  },
  'site.name': {
    isSensitive: false,
    schema: z.string().trim().min(1, 'Site name cannot be empty'),
  },
  'site.title': {
    isSensitive: false,
    schema: z.string().trim().min(1, 'Site title cannot be empty'),
  },
  'site.description': {
    isSensitive: false,
    schema: z.string().trim().min(1, 'Site description cannot be empty'),
  },
  'site.url': {
    isSensitive: false,
    schema: z.string().trim().url('Site URL must be a valid URL'),
  },
  'site.accentColor': {
    isSensitive: false,
    schema: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Accent color cannot be empty',
          })
          return
        }

        if (!HEX_COLOR_REGEX.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Accent color must be a valid hex color',
          })
        }
      }),
  },
  'site.author.name': {
    isSensitive: false,
    schema: z.string().trim().min(1, 'Author name cannot be empty'),
  },
  'site.author.url': {
    isSensitive: false,
    schema: z.url('Author URL must be a valid URL'),
  },
  'site.author.avatar': {
    isSensitive: false,
    schema: createOptionalUrlSchema('Author avatar must be a valid URL'),
  },
  'site.social.twitter': {
    isSensitive: false,
    schema: z.string().trim(),
  },
  'site.social.github': {
    isSensitive: false,
    schema: z.string().trim(),
  },
  'site.social.rss': {
    isSensitive: false,
    schema: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          return
        }

        if (value !== 'true' && value !== 'false') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'RSS toggle must be either "true" or "false"',
          })
        }
      }),
  },
  'site.feed.folo.challenge.feedId': {
    isSensitive: false,
    schema: z.string().trim(),
  },
  'site.feed.folo.challenge.userId': {
    isSensitive: false,
    schema: z.string().trim(),
  },
  'site.map.providers': {
    isSensitive: false,
    schema: createJsonStringArraySchema({
      allowEmpty: true,
      errorMessage: 'Map providers must be a JSON array of provider identifiers',
      validator: (value): value is string => typeof value === 'string',
    }),
  },
  'site.mapStyle': {
    isSensitive: false,
    schema: z.string().trim(),
  },
  'site.mapProjection': {
    isSensitive: false,
    schema: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          return
        }

        if (value !== 'globe' && value !== 'mercator') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Map projection must be either globe or mercator',
          })
        }
      }),
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
