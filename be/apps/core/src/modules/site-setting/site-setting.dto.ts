import { createZodDto } from '@afilmory/framework'
import { z } from 'zod'

import { SETTING_SCHEMAS } from '../setting/setting.constant'
import { SITE_SETTING_KEYS } from './site-setting.type'

const keySchema = z.enum(SITE_SETTING_KEYS)

const entrySchema = z
  .object({
    key: keySchema,
    value: z.unknown(),
  })
  .transform((entry) => ({
    key: entry.key,
    value: SETTING_SCHEMAS[entry.key].parse(entry.value),
  }))

export class UpdateSiteSettingsDto extends createZodDto(
  z.object({
    entries: z.array(entrySchema).min(1),
  }),
) {}
