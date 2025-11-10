import { injectable } from 'tsyringe'

import type { SettingEntryInput } from '../setting/setting.service'
import { SettingService } from '../setting/setting.service'
import type { UiNode } from '../ui-schema/ui-schema.type'
import type { SiteSettingEntryInput, SiteSettingKey, SiteSettingUiSchemaResponse } from './site-setting.type'
import { ONBOARDING_SITE_SETTING_KEYS, SITE_SETTING_KEYS } from './site-setting.type'
import { SITE_SETTING_UI_SCHEMA, SITE_SETTING_UI_SCHEMA_KEYS } from './site-setting.ui-schema'

@injectable()
export class SiteSettingService {
  constructor(private readonly settingService: SettingService) {}

  async getUiSchema(): Promise<SiteSettingUiSchemaResponse> {
    const values = await this.settingService.getMany(SITE_SETTING_UI_SCHEMA_KEYS, {})
    const typedValues: SiteSettingUiSchemaResponse['values'] = {}

    for (const key of SITE_SETTING_KEYS) {
      typedValues[key] = values[key] ?? null
    }

    return {
      schema: SITE_SETTING_UI_SCHEMA,
      values: typedValues,
    }
  }

  async getOnboardingUiSchema(): Promise<SiteSettingUiSchemaResponse> {
    const allowedKeys = new Set<SiteSettingKey>(ONBOARDING_SITE_SETTING_KEYS)
    const schema = this.filterSchema(SITE_SETTING_UI_SCHEMA, allowedKeys)

    return {
      schema,
      values: {},
    }
  }

  async setMany(entries: readonly SiteSettingEntryInput[]): Promise<void> {
    if (entries.length === 0) {
      return
    }

    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      value: typeof entry.value === 'string' ? entry.value : String(entry.value),
    })) as readonly SettingEntryInput[]

    await this.settingService.setMany(normalizedEntries)
  }

  async get(key: SiteSettingKey) {
    return await this.settingService.get(key, {})
  }

  async getSiteConfig(): Promise<SiteConfig> {
    const values = await this.settingService.getMany(SITE_SETTING_KEYS, {})

    const config: SiteConfig = {
      ...DEFAULT_SITE_CONFIG,
      author: { ...DEFAULT_SITE_CONFIG.author },
    }

    assignString(values['site.name'], (value) => (config.name = value))
    assignString(values['site.title'], (value) => (config.title = value))
    assignString(values['site.description'], (value) => (config.description = value))
    assignString(values['site.url'], (value) => (config.url = value))
    assignString(values['site.accentColor'], (value) => (config.accentColor = value))

    assignString(values['site.author.name'], (value) => (config.author.name = value))
    assignString(values['site.author.url'], (value) => (config.author.url = value))
    assignString(values['site.author.avatar'], (value) => {
      config.author.avatar = value
    })

    const social = buildSocialConfig(values)
    if (social) {
      config.social = social
    }

    const feed = buildFeedConfig(values)
    if (feed) {
      config.feed = feed
    }

    const mapProviders = parseJsonStringArray(values['site.map.providers'])
    if (mapProviders && mapProviders.length > 0) {
      config.map = mapProviders
    }

    assignString(values['site.mapStyle'], (value) => (config.mapStyle = value))

    const projection = normalizeMapProjection(values['site.mapProjection'])
    if (projection) {
      config.mapProjection = projection
    }

    return config
  }

  private filterSchema(
    schema: SiteSettingUiSchemaResponse['schema'],
    allowed: Set<SiteSettingKey>,
  ): SiteSettingUiSchemaResponse['schema'] {
    const filterNodes = (nodes: ReadonlyArray<UiNode<SiteSettingKey>>): Array<UiNode<SiteSettingKey>> => {
      const filtered: Array<UiNode<SiteSettingKey>> = []

      for (const node of nodes) {
        if (node.type === 'field') {
          if (allowed.has(node.key)) {
            filtered.push(node)
          }
          continue
        }

        const filteredChildren = filterNodes(node.children)
        if (filteredChildren.length === 0) {
          continue
        }

        filtered.push({ ...node, children: filteredChildren })
      }

      return filtered
    }

    return {
      ...schema,
      sections: filterNodes(schema.sections) as SiteSettingUiSchemaResponse['schema']['sections'],
    }
  }
}

interface SiteConfigAuthor {
  name: string
  url: string
  avatar?: string
}

interface SiteConfigSocial {
  twitter?: string
  github?: string
  rss?: boolean
}

interface SiteConfigFeed {
  folo?: {
    challenge?: {
      feedId?: string
      userId?: string
    }
  }
}

type SiteConfigMapProviders = string[]

type SiteConfigProjection = 'globe' | 'mercator'

interface SiteConfig {
  name: string
  title: string
  description: string
  url: string
  accentColor: string
  author: SiteConfigAuthor
  social?: SiteConfigSocial
  feed?: SiteConfigFeed
  map?: SiteConfigMapProviders
  mapStyle?: string
  mapProjection?: SiteConfigProjection
}

const DEFAULT_SITE_CONFIG: SiteConfig = {
  name: 'Default Site',
  title: 'Default Site',
  description: 'Default Site',
  url: '',
  accentColor: '#007bff',
  author: {
    name: '',
    url: '',
  },
}

type SiteSettingValueMap = Partial<Record<SiteSettingKey, string | null>>

function assignString(value: string | null | undefined, updater: (value: string) => void) {
  const normalized = normalizeString(value)
  if (normalized === undefined) {
    return
  }
  updater(normalized)
}

function normalizeString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseJsonStringArray(value: string | null | undefined): string[] | undefined {
  const normalized = normalizeString(value)
  if (!normalized) {
    return undefined
  }

  try {
    const parsed = JSON.parse(normalized)
    if (!Array.isArray(parsed)) {
      return undefined
    }

    const result = parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim())
    return result.length > 0 ? result : undefined
  } catch {
    return undefined
  }
}

function parseBooleanString(value: string | null | undefined): boolean | undefined {
  const normalized = normalizeString(value)
  if (!normalized) {
    return undefined
  }

  if (normalized === 'true') {
    return true
  }
  if (normalized === 'false') {
    return false
  }
  return undefined
}

function buildSocialConfig(values: SiteSettingValueMap): SiteConfig['social'] | undefined {
  const social: NonNullable<SiteConfig['social']> = {}

  assignString(values['site.social.twitter'], (value) => {
    social.twitter = value
  })

  assignString(values['site.social.github'], (value) => {
    social.github = value
  })

  const rss = parseBooleanString(values['site.social.rss'])
  if (typeof rss === 'boolean') {
    social.rss = rss
  }

  return Object.keys(social).length > 0 ? social : undefined
}

function buildFeedConfig(values: SiteSettingValueMap): SiteConfig['feed'] | undefined {
  const feedId = normalizeString(values['site.feed.folo.challenge.feedId'])
  const userId = normalizeString(values['site.feed.folo.challenge.userId'])

  if (!feedId && !userId) {
    return undefined
  }

  return {
    folo: {
      challenge: {
        ...(feedId ? { feedId } : {}),
        ...(userId ? { userId } : {}),
      },
    },
  }
}

function normalizeMapProjection(value: string | null | undefined): SiteConfig['mapProjection'] | undefined {
  const normalized = normalizeString(value)
  if (!normalized) {
    return undefined
  }

  if (normalized === 'globe' || normalized === 'mercator') {
    return normalized
  }

  return undefined
}
