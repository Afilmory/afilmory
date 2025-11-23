import { authUsers } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeStringToUndefined } from 'core/helpers/normalize.helper'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import { asc, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { getUiSchemaTranslator } from '../../ui/ui-schema/ui-schema.i18n'
import type { UiNode } from '../../ui/ui-schema/ui-schema.type'
import type { SettingEntryInput } from '../setting/setting.service'
import { SettingService } from '../setting/setting.service'
import type { SiteSettingEntryInput, SiteSettingKey, SiteSettingUiSchemaResponse } from './site-setting.type'
import { ONBOARDING_SITE_SETTING_KEYS, SITE_SETTING_KEYS } from './site-setting.type'
import { createSiteSettingUiSchema, SITE_SETTING_UI_SCHEMA_KEYS } from './site-setting.ui-schema'

@injectable()
export class SiteSettingService {
  constructor(
    private readonly settingService: SettingService,
    private readonly dbAccessor: DbAccessor,
  ) {}

  async getUiSchema(): Promise<SiteSettingUiSchemaResponse> {
    const values = await this.settingService.getMany(SITE_SETTING_UI_SCHEMA_KEYS, {})
    const typedValues: SiteSettingUiSchemaResponse['values'] = {}

    for (const key of SITE_SETTING_KEYS) {
      typedValues[key] = values[key] ?? null
    }

    const { t } = getUiSchemaTranslator()

    return {
      schema: createSiteSettingUiSchema(t),
      values: typedValues,
    }
  }

  async getOnboardingUiSchema(): Promise<SiteSettingUiSchemaResponse> {
    const allowedKeys = new Set<SiteSettingKey>(ONBOARDING_SITE_SETTING_KEYS)

    const { t } = getUiSchemaTranslator()
    const schema = this.filterSchema(createSiteSettingUiSchema(t), allowedKeys)

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

    const resolvedAuthor = await this.resolveAuthorFromTenant(config.name)
    if (resolvedAuthor) {
      config.author = resolvedAuthor
    } else if (!config.author.name) {
      config.author.name = config.name
    }

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

  async getAuthorProfile(): Promise<SiteAuthorProfile> {
    const user = await this.findPrimaryAuthorUser()
    if (!user) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '当前租户缺少可更新的作者账号，请先创建管理员账号。',
      })
    }
    return toSiteAuthorProfile(user)
  }

  async updateAuthorProfile(input: UpdateSiteAuthorInput): Promise<SiteAuthorProfile> {
    const user = await this.findPrimaryAuthorUser()
    if (!user) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '当前租户缺少可更新的作者账号，请先创建管理员账号。',
      })
    }

    const name = normalizeStringToUndefined(input.name)
    if (!name) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, { message: '作者名称不能为空' })
    }

    const displayUsername = normalizeOptionalString(input.displayUsername)
    const username = normalizeOptionalString(input.username)
    const avatar = this.normalizeAvatarInput(input.avatar)

    const now = new Date().toISOString()
    const db = this.dbAccessor.get()

    await db
      .update(authUsers)
      .set({
        name,
        displayUsername,
        username,
        image: avatar,
        updatedAt: now,
      })
      .where(eq(authUsers.id, user.id))

    return toSiteAuthorProfile({
      ...user,
      name,
      displayUsername,
      username,
      image: avatar,
      updatedAt: now,
    })
  }

  private async resolveAuthorFromTenant(siteName: string): Promise<SiteConfigAuthor | null> {
    const user = await this.findPrimaryAuthorUser()
    if (!user) {
      return null
    }

    const fallbackName = normalizeStringToUndefined(siteName) ?? siteName
    const normalizedName =
      normalizeStringToUndefined(user.displayUsername) ??
      normalizeStringToUndefined(user.username) ??
      normalizeStringToUndefined(user.name) ??
      fallbackName

    const author: SiteConfigAuthor = {
      name: normalizedName,
    }

    const avatar = normalizeStringToUndefined(user.image)
    if (avatar) {
      author.avatar = avatar
    }

    return author
  }

  private async findPrimaryAuthorUser(): Promise<AuthorUserRecord | null> {
    const tenant = requireTenantContext()
    const db = this.dbAccessor.get()
    const [user] = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        displayUsername: authUsers.displayUsername,
        username: authUsers.username,
        image: authUsers.image,
        role: authUsers.role,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .where(eq(authUsers.tenantId, tenant.tenant.id))
      .orderBy(
        sql`case when ${authUsers.role} = 'admin' then 0 when ${authUsers.role} = 'superadmin' then 1 else 2 end`,
        asc(authUsers.createdAt),
      )
      .limit(1)

    return user ?? null
  }

  private normalizeAvatarInput(value: string | null | undefined): string | null {
    const normalized = normalizeStringToUndefined(value)
    if (!normalized) {
      return null
    }

    if (normalized.startsWith('//')) {
      return normalized
    }

    try {
      const url = new URL(normalized)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol')
      }
      return url.toString()
    } catch {
      throw new BizException(ErrorCode.COMMON_VALIDATION, {
        message: '头像链接必须是以 http(s) 或 // 开头的有效 URL',
      })
    }
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

interface SiteAuthorProfile {
  id: string
  email: string
  name: string
  username: string | null
  displayUsername: string | null
  avatar: string | null
  createdAt: string
  updatedAt: string
}

interface UpdateSiteAuthorInput {
  name: string
  displayUsername?: string | null
  username?: string | null
  avatar?: string | null
}

type AuthorUserRecord = {
  id: string
  name: string
  email: string
  username: string | null
  displayUsername: string | null
  image: string | null
  role: string
  createdAt: string
  updatedAt: string
}

interface SiteConfigAuthor {
  name: string
  url?: string
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
  },
}

type SiteSettingValueMap = Partial<Record<SiteSettingKey, string | null>>

function assignString(value: string | null | undefined, updater: (value: string) => void) {
  const normalized = normalizeStringToUndefined(value)
  if (normalized === undefined) {
    return
  }
  updater(normalized)
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = normalizeStringToUndefined(value)
  return normalized ?? null
}

function toSiteAuthorProfile(user: AuthorUserRecord): SiteAuthorProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username ?? null,
    displayUsername: user.displayUsername ?? null,
    avatar: user.image ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function parseJsonStringArray(value: string | null | undefined): string[] | undefined {
  const normalized = normalizeStringToUndefined(value)
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
  const normalized = normalizeStringToUndefined(value)
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
  const feedId = normalizeStringToUndefined(values['site.feed.folo.challenge.feedId'])
  const userId = normalizeStringToUndefined(values['site.feed.folo.challenge.userId'])

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
  const normalized = normalizeStringToUndefined(value)
  if (!normalized) {
    return undefined
  }

  if (normalized === 'globe' || normalized === 'mercator') {
    return normalized
  }

  return undefined
}
