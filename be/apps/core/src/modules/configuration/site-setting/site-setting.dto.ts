import { createZodDto } from '@tsuki/framework'
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

const updateAuthorSchema = z.object({
  name: z.string().trim().min(1, '作者名称不能为空'),
  displayUsername: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
})

export class UpdateSiteAuthorDto extends createZodDto(updateAuthorSchema) {}
