import { authUsers } from '@afilmory/db'
import { BizException, ErrorCode } from 'core/errors'
import { sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import type { ZodType } from 'zod'

import { DbAccessor } from '../../database/database.provider'
import type { SocialProvidersConfig } from '../auth/auth.config'
import { SYSTEM_SETTING_DEFINITIONS, SYSTEM_SETTING_KEYS } from './system-setting.constants'
import { SystemSettingStore } from './system-setting.store.service'
import type {
  SystemSettingField,
  SystemSettingOverview,
  SystemSettings,
  SystemSettingStats,
  UpdateSystemSettingsInput,
} from './system-setting.types'
import { SYSTEM_SETTING_UI_SCHEMA } from './system-setting.ui-schema'

@injectable()
export class SystemSettingService {
  constructor(
    private readonly systemSettingStore: SystemSettingStore,
    private readonly dbAccessor: DbAccessor,
  ) {}

  async getSettings(): Promise<SystemSettings> {
    const rawValues = await this.systemSettingStore.getMany(SYSTEM_SETTING_KEYS)

    const allowRegistration = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.allowRegistration.key],
      SYSTEM_SETTING_DEFINITIONS.allowRegistration.schema,
      SYSTEM_SETTING_DEFINITIONS.allowRegistration.defaultValue,
    )

    const maxRegistrableUsers = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.key],
      SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.schema,
      SYSTEM_SETTING_DEFINITIONS.maxRegistrableUsers.defaultValue,
    )

    const localProviderEnabled = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.key],
      SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.schema,
      SYSTEM_SETTING_DEFINITIONS.localProviderEnabled.defaultValue,
    )

    const baseDomainRaw = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.baseDomain.key],
      SYSTEM_SETTING_DEFINITIONS.baseDomain.schema,
      SYSTEM_SETTING_DEFINITIONS.baseDomain.defaultValue,
    )

    const baseDomain = baseDomainRaw.trim().toLowerCase()

    const oauthGoogleClientId = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientId.defaultValue,
    )
    const oauthGoogleClientSecret = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGoogleClientSecret.defaultValue,
    )
    const oauthGoogleRedirectUri = this.normalizeRedirectPath(
      this.parseSetting(
        rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGoogleRedirectUri.key],
        SYSTEM_SETTING_DEFINITIONS.oauthGoogleRedirectUri.schema,
        SYSTEM_SETTING_DEFINITIONS.oauthGoogleRedirectUri.defaultValue,
      ),
    )

    const oauthGithubClientId = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientId.defaultValue,
    )
    const oauthGithubClientSecret = this.parseSetting(
      rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.key],
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.schema,
      SYSTEM_SETTING_DEFINITIONS.oauthGithubClientSecret.defaultValue,
    )
    const oauthGithubRedirectUri = this.normalizeRedirectPath(
      this.parseSetting(
        rawValues[SYSTEM_SETTING_DEFINITIONS.oauthGithubRedirectUri.key],
        SYSTEM_SETTING_DEFINITIONS.oauthGithubRedirectUri.schema,
        SYSTEM_SETTING_DEFINITIONS.oauthGithubRedirectUri.defaultValue,
      ),
    )

    return {
      allowRegistration,
      maxRegistrableUsers,
      localProviderEnabled,
      baseDomain,
      oauthGoogleClientId,
      oauthGoogleClientSecret,
      oauthGoogleRedirectUri,
      oauthGithubClientId,
      oauthGithubClientSecret,
      oauthGithubRedirectUri,
    }
  }

  async getStats(): Promise<SystemSettingStats> {
    const settings = await this.getSettings()
    const totalUsers = await this.getTotalUserCount()
    return this.buildStats(settings, totalUsers)
  }

  async getOverview(): Promise<SystemSettingOverview> {
    const values = await this.getSettings()
    const totalUsers = await this.getTotalUserCount()
    const stats = this.buildStats(values, totalUsers)
    return {
      schema: SYSTEM_SETTING_UI_SCHEMA,
      values,
      stats,
    }
  }

  async updateSettings(patch: UpdateSystemSettingsInput): Promise<SystemSettings> {
    if (!patch || Object.values(patch).every((value) => value === undefined)) {
      return await this.getSettings()
    }

    const current = await this.getSettings()
    const updates: Array<{ field: SystemSettingField; value: SystemSettings[SystemSettingField] }> = []

    const enqueueUpdate = <K extends SystemSettingField>(field: K, value: SystemSettings[K]) => {
      updates.push({ field, value })
      current[field] = value
    }

    if (patch.allowRegistration !== undefined && patch.allowRegistration !== current.allowRegistration) {
      enqueueUpdate('allowRegistration', patch.allowRegistration)
    }

    if (patch.localProviderEnabled !== undefined && patch.localProviderEnabled !== current.localProviderEnabled) {
      enqueueUpdate('localProviderEnabled', patch.localProviderEnabled)
    }

    if (patch.maxRegistrableUsers !== undefined) {
      const normalized = patch.maxRegistrableUsers === null ? null : Math.max(0, Math.trunc(patch.maxRegistrableUsers))
      if (normalized !== current.maxRegistrableUsers) {
        if (normalized !== null) {
          const totalUsers = await this.getTotalUserCount()
          if (normalized < totalUsers) {
            throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
              message: '最大可注册用户数不能小于当前用户总数',
            })
          }
        }

        enqueueUpdate('maxRegistrableUsers', normalized)
      }
    }

    if (patch.baseDomain !== undefined) {
      const sanitized = patch.baseDomain === null ? null : String(patch.baseDomain).trim().toLowerCase()
      if (!sanitized) {
        enqueueUpdate('baseDomain', SYSTEM_SETTING_DEFINITIONS.baseDomain.defaultValue)
      } else if (sanitized !== current.baseDomain) {
        enqueueUpdate('baseDomain', sanitized)
      }
    }

    if (patch.oauthGoogleClientId !== undefined) {
      const sanitized = this.normalizeNullableString(patch.oauthGoogleClientId)
      if (sanitized !== current.oauthGoogleClientId) {
        enqueueUpdate('oauthGoogleClientId', sanitized)
      }
    }

    if (patch.oauthGoogleClientSecret !== undefined) {
      const sanitized = this.normalizeNullableString(patch.oauthGoogleClientSecret)
      if (sanitized !== current.oauthGoogleClientSecret) {
        enqueueUpdate('oauthGoogleClientSecret', sanitized)
      }
    }

    if (patch.oauthGoogleRedirectUri !== undefined) {
      const sanitized = this.normalizeRedirectPath(patch.oauthGoogleRedirectUri)
      if (sanitized !== current.oauthGoogleRedirectUri) {
        enqueueUpdate('oauthGoogleRedirectUri', sanitized)
      }
    }

    if (patch.oauthGithubClientId !== undefined) {
      const sanitized = this.normalizeNullableString(patch.oauthGithubClientId)
      if (sanitized !== current.oauthGithubClientId) {
        enqueueUpdate('oauthGithubClientId', sanitized)
      }
    }

    if (patch.oauthGithubClientSecret !== undefined) {
      const sanitized = this.normalizeNullableString(patch.oauthGithubClientSecret)
      if (sanitized !== current.oauthGithubClientSecret) {
        enqueueUpdate('oauthGithubClientSecret', sanitized)
      }
    }

    if (patch.oauthGithubRedirectUri !== undefined) {
      const sanitized = this.normalizeRedirectPath(patch.oauthGithubRedirectUri)
      if (sanitized !== current.oauthGithubRedirectUri) {
        enqueueUpdate('oauthGithubRedirectUri', sanitized)
      }
    }

    if (updates.length === 0) {
      return current
    }

    await this.systemSettingStore.setMany(
      updates.map((entry) => {
        const definition = SYSTEM_SETTING_DEFINITIONS[entry.field]
        return {
          key: definition.key,
          value: (entry.value ?? null) as SystemSettings[typeof entry.field] | null,
          options: { isSensitive: definition.isSensitive ?? false },
        }
      }),
    )

    return current
  }

  async ensureRegistrationAllowed(): Promise<void> {
    const settings = await this.getSettings()

    if (!settings.allowRegistration) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '当前已关闭用户注册，请联系管理员获取访问权限。',
      })
    }

    if (settings.maxRegistrableUsers === null) {
      return
    }

    const totalUsers = await this.getTotalUserCount()
    if (totalUsers >= settings.maxRegistrableUsers) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '用户注册数量已达到上限，请联系管理员。',
      })
    }
  }

  async getAuthModuleConfig(): Promise<{ baseDomain: string; socialProviders: SocialProvidersConfig }> {
    const settings = await this.getSettings()
    return {
      baseDomain: settings.baseDomain,
      socialProviders: this.buildSocialProviders(settings),
    }
  }

  private parseSetting<T>(raw: unknown, schema: ZodType<T>, defaultValue: T): T {
    if (raw === null || raw === undefined) {
      return defaultValue
    }

    const parsed = schema.safeParse(raw)
    return parsed.success ? parsed.data : defaultValue
  }

  private buildSocialProviders(settings: SystemSettings): SocialProvidersConfig {
    const providers: SocialProvidersConfig = {}

    if (settings.oauthGoogleClientId && settings.oauthGoogleClientSecret) {
      providers.google = {
        clientId: settings.oauthGoogleClientId,
        clientSecret: settings.oauthGoogleClientSecret,
        redirectPath: settings.oauthGoogleRedirectUri,
      }
    }

    if (settings.oauthGithubClientId && settings.oauthGithubClientSecret) {
      providers.github = {
        clientId: settings.oauthGithubClientId,
        clientSecret: settings.oauthGithubClientSecret,
        redirectPath: settings.oauthGithubRedirectUri,
      }
    }

    return providers
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private normalizeRedirectPath(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }

    const ensureLeadingSlash = (input: string): string | null => {
      if (!input.startsWith('/')) {
        return null
      }
      return input
    }

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const url = new URL(trimmed)
        const pathWithQuery = `${url.pathname}${url.search ?? ''}`
        return ensureLeadingSlash(pathWithQuery) ?? null
      }
    } catch {
      // fall through to path handling
    }

    return ensureLeadingSlash(trimmed)
  }

  private buildStats(settings: SystemSettings, totalUsers: number): SystemSettingStats {
    const remaining =
      settings.maxRegistrableUsers === null ? null : Math.max(settings.maxRegistrableUsers - totalUsers, 0)

    return {
      totalUsers,
      registrationsRemaining: remaining,
    }
  }

  private async getTotalUserCount(): Promise<number> {
    const [row] = await this.dbAccessor
      .get()
      .select({ total: sql<number>`count(*)` })
      .from(authUsers)
    return typeof row?.total === 'number' ? row.total : Number(row?.total ?? 0)
  }
}
