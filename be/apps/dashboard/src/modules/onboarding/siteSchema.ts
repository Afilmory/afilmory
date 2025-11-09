import { z } from 'zod'

import type { OnboardingSiteSettingKey } from './constants'

const stringValue = (validator: z.ZodString) => z.preprocess((value) => (value == null ? '' : String(value)), validator)

const trimmed = (min: number, message: string) => stringValue(z.string().trim().min(min, { message }))

export const siteSettingsSchema = z
  .object({
    'site.name': trimmed(1, 'Site name is required'),
    'site.title': trimmed(1, 'Home title is required'),
    'site.description': trimmed(1, 'Site description is required'),
  })
  .passthrough()

export type SiteSettingsSchema = typeof siteSettingsSchema
export type SiteSettingsValues = z.infer<SiteSettingsSchema>

export const SITE_SETTINGS_KEYS = Object.keys(siteSettingsSchema.shape) as OnboardingSiteSettingKey[]

export const DEFAULT_SITE_SETTINGS_VALUES: SiteSettingsValues = {
  'site.name': '',
  'site.title': '',
  'site.description': '',
}
