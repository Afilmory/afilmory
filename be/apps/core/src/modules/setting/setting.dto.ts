import { createZodDto } from '@afilmory/framework'
import { z } from 'zod'

import { SETTING_SCHEMAS, SettingKeys } from './setting.constant'

const keySchema = z.enum(SettingKeys)

const settingEntrySchema = z.object({
  key: keySchema,
  value: z.unknown(),
})

const normalizeEntries = z
  .union([settingEntrySchema, z.object({ entries: z.array(settingEntrySchema).min(1) })])
  .transform((payload) => {
    const entries = 'entries' in payload ? payload.entries : [payload]
    return entries.map((entry) => ({
      key: entry.key,
      value: SETTING_SCHEMAS[entry.key].parse(entry.value),
    }))
  })

const keysInputSchema = z
  .union([keySchema, z.array(keySchema)])
  .transform((value) => (Array.isArray(value) ? value : [value]))

export class GetSettingDto extends createZodDto(
  z.object({
    key: keySchema,
  }),
) {}

export class GetSettingsBodyDto extends createZodDto(
  z.object({
    keys: keysInputSchema.optional(),
  }),
) {}

export class SetSettingDto extends createZodDto(normalizeEntries.transform((entries) => ({ entries }))) {}

export class DeleteSettingDto extends createZodDto(
  z
    .union([z.object({ key: keySchema }), z.object({ keys: z.array(keySchema).min(1) })])
    .transform((payload) => ({ keys: 'keys' in payload ? payload.keys : [payload.key] })),
) {}
