import type { BuilderConfig, StorageConfig } from '@afilmory/builder'
import { LOCAL_STORAGE_PROVIDERS } from '@afilmory/builder/storage/index.js'
import type {
  B2Config,
  GitHubConfig,
  LocalStorageProviderName,
  ManagedStorageConfig,
  RemoteStorageConfig,
  S3Config,
} from '@afilmory/builder/storage/interfaces.js'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeStringToUndefined, requireStringWithMessage } from 'core/helpers/normalize.helper'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'
import { SettingService } from 'core/modules/configuration/setting/setting.service'
import type { BuilderStorageProvider } from 'core/modules/configuration/setting/storage-provider.utils'
import { SystemSettingService } from 'core/modules/configuration/system-setting/system-setting.service'
import { StoragePlanService } from 'core/modules/platform/billing/storage-plan.service'
import { injectable } from 'tsyringe'

type ResolveOverrides = {
  builderConfig?: BuilderConfig
  storageConfig?: StorageConfig
}

const MANAGED_ACTIVE_PROVIDER_ID = 'managed'

@injectable()
export class PhotoStorageService {
  constructor(
    private readonly settingService: SettingService,
    private readonly builderConfigService: BuilderConfigService,
    private readonly systemSettingService: SystemSettingService,
    private readonly storagePlanService: StoragePlanService,
  ) {}

  async resolveConfigForTenant(
    tenantId: string,
    overrides: ResolveOverrides = {},
  ): Promise<{ builderConfig: BuilderConfig; storageConfig: StorageConfig }> {
    const activeProviderIdRaw = await this.settingService.get('builder.storage.activeProvider', { tenantId })
    const activeProviderId =
      typeof activeProviderIdRaw === 'string' && activeProviderIdRaw.trim().length > 0
        ? activeProviderIdRaw.trim()
        : null

    if (overrides.builderConfig) {
      const storageConfig = overrides.storageConfig ?? overrides.builderConfig.user?.storage
      if (!storageConfig) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: 'Builder config override is missing storage configuration.',
        })
      }
      return { builderConfig: overrides.builderConfig, storageConfig }
    }

    const activeProvider = await this.settingService.getActiveStorageProvider({ tenantId })
    if (activeProviderId === MANAGED_ACTIVE_PROVIDER_ID) {
      const managedConfig = await this.tryResolveManagedStorageConfig(tenantId)
      if (managedConfig) {
        const builderConfig = await this.builderConfigService.getConfigForTenant(tenantId)
        const userSettings = this.ensureUserSettings(builderConfig)
        userSettings.storage = managedConfig
        return { builderConfig, storageConfig: managedConfig }
      }
    }

    if (!activeProvider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: 'Active storage provider is not configured. Configure storage settings before running sync.',
      })
    }

    const storageConfig = this.mapProviderToStorageConfig(activeProvider)
    const builderConfig = await this.builderConfigService.getConfigForTenant(tenantId)
    const userSettings = this.ensureUserSettings(builderConfig)
    userSettings.storage = storageConfig

    return { builderConfig, storageConfig }
  }

  private async tryResolveManagedStorageConfig(tenantId: string): Promise<ManagedStorageConfig | null> {
    const [plan, provider] = await Promise.all([
      this.storagePlanService.getPlanSummaryForTenant(tenantId),
      this.systemSettingService.getManagedStorageProvider(),
    ])

    if (!plan) {
      return null
    }

    if (!provider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '托管存储尚未启用或未配置 Provider。',
      })
    }

    const upstream = this.mapProviderToStorageConfig(provider) as RemoteStorageConfig

    return {
      provider: 'managed',
      providerKey: provider.id,
      tenantId,
      upstream,
      basePrefix: null,
    }
  }

  private mapProviderToStorageConfig(provider: BuilderStorageProvider): StorageConfig {
    this.assertProviderSupported(provider.type)

    const config = provider.config ?? {}
    switch (provider.type) {
      case 's3': {
        const bucket = requireStringWithMessage(config.bucket, 'Active S3 storage provider is missing `bucket`.')
        const result: S3Config = {
          provider: 's3',
          bucket,
        }

        const region = normalizeStringToUndefined(config.region)
        if (region) result.region = region
        const endpoint = normalizeStringToUndefined(config.endpoint)
        if (endpoint) result.endpoint = endpoint
        const accessKeyId = normalizeStringToUndefined(config.accessKeyId)
        if (accessKeyId) result.accessKeyId = accessKeyId
        const secretAccessKey = normalizeStringToUndefined(config.secretAccessKey)
        if (secretAccessKey) result.secretAccessKey = secretAccessKey
        const prefix = normalizeStringToUndefined(config.prefix)
        if (prefix) result.prefix = prefix
        const customDomain = normalizeStringToUndefined(config.customDomain)
        if (customDomain) result.customDomain = customDomain
        const excludeRegex = normalizeStringToUndefined(config.excludeRegex)
        if (excludeRegex) result.excludeRegex = excludeRegex

        const maxFileLimit = this.parseNumber(config.maxFileLimit)
        if (typeof maxFileLimit === 'number') result.maxFileLimit = maxFileLimit
        const keepAlive = this.parseBoolean(config.keepAlive)
        if (typeof keepAlive === 'boolean') result.keepAlive = keepAlive
        const maxSockets = this.parseNumber(config.maxSockets)
        if (typeof maxSockets === 'number') result.maxSockets = maxSockets
        const connectionTimeoutMs = this.parseNumber(config.connectionTimeoutMs)
        if (typeof connectionTimeoutMs === 'number') result.connectionTimeoutMs = connectionTimeoutMs
        const socketTimeoutMs = this.parseNumber(config.socketTimeoutMs)
        if (typeof socketTimeoutMs === 'number') result.socketTimeoutMs = socketTimeoutMs
        const requestTimeoutMs = this.parseNumber(config.requestTimeoutMs)
        if (typeof requestTimeoutMs === 'number') result.requestTimeoutMs = requestTimeoutMs
        const idleTimeoutMs = this.parseNumber(config.idleTimeoutMs)
        if (typeof idleTimeoutMs === 'number') result.idleTimeoutMs = idleTimeoutMs
        const totalTimeoutMs = this.parseNumber(config.totalTimeoutMs)
        if (typeof totalTimeoutMs === 'number') result.totalTimeoutMs = totalTimeoutMs
        const retryMode = this.parseRetryMode(config.retryMode)
        if (retryMode) result.retryMode = retryMode
        const maxAttempts = this.parseNumber(config.maxAttempts)
        if (typeof maxAttempts === 'number') result.maxAttempts = maxAttempts
        const downloadConcurrency = this.parseNumber(config.downloadConcurrency)
        if (typeof downloadConcurrency === 'number') result.downloadConcurrency = downloadConcurrency

        return result
      }
      case 'github': {
        const owner = requireStringWithMessage(config.owner, 'Active GitHub storage provider is missing `owner`.')
        const repo = requireStringWithMessage(config.repo, 'Active GitHub storage provider is missing `repo`.')

        const result: GitHubConfig = {
          provider: 'github',
          owner,
          repo,
        }

        const branch = normalizeStringToUndefined(config.branch)
        if (branch) result.branch = branch
        const token = normalizeStringToUndefined(config.token)
        if (token) result.token = token
        const pathValue = normalizeStringToUndefined(config.path)
        if (pathValue) result.path = pathValue
        const useRawUrl = this.parseBoolean(config.useRawUrl)
        if (typeof useRawUrl === 'boolean') result.useRawUrl = useRawUrl

        return result
      }
      case 'b2': {
        const applicationKeyId = requireStringWithMessage(
          config.applicationKeyId,
          'Active B2 storage provider is missing `applicationKeyId`.',
        )
        const applicationKey = requireStringWithMessage(
          config.applicationKey,
          'Active B2 storage provider is missing `applicationKey`.',
        )
        const bucketId = requireStringWithMessage(config.bucketId, 'Active B2 storage provider is missing `bucketId`.')

        const bucketName = requireStringWithMessage(
          config.bucketName,
          'Active B2 storage provider is missing `bucketName`.',
        )

        const result: B2Config = {
          provider: 'b2',
          applicationKeyId,
          applicationKey,
          bucketId,
          bucketName,
        }
        const prefix = normalizeStringToUndefined(config.prefix)
        if (prefix) result.prefix = prefix
        const customDomain = normalizeStringToUndefined(config.customDomain)
        if (customDomain) result.customDomain = customDomain
        const excludeRegex = normalizeStringToUndefined(config.excludeRegex)
        if (excludeRegex) result.excludeRegex = excludeRegex

        const maxFileLimit = this.parseNumber(config.maxFileLimit)
        if (typeof maxFileLimit === 'number') result.maxFileLimit = maxFileLimit
        const authorizationTtlMs = this.parseNumber(config.authorizationTtlMs)
        if (typeof authorizationTtlMs === 'number') result.authorizationTtlMs = authorizationTtlMs
        const uploadUrlTtlMs = this.parseNumber(config.uploadUrlTtlMs)
        if (typeof uploadUrlTtlMs === 'number') result.uploadUrlTtlMs = uploadUrlTtlMs

        return result
      }
      default: {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
          message: `Unsupported storage provider type: ${provider.type}`,
        })
      }
    }
  }

  private assertProviderSupported(provider: string): void {
    if (LOCAL_STORAGE_PROVIDERS.includes(provider as LocalStorageProviderName)) {
      const label = provider === 'eagle' ? 'Eagle' : provider === 'local' ? 'Local' : provider
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `云端服务不支持 ${label} 存储提供商`,
      })
    }
  }

  private parseNumber(value?: string | null): number | undefined {
    const normalized = normalizeStringToUndefined(value)
    if (!normalized) {
      return undefined
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private parseBoolean(value?: string | null): boolean | undefined {
    const normalized = normalizeStringToUndefined(value)
    if (!normalized) {
      return undefined
    }

    const lowered = normalized.toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) {
      return true
    }
    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) {
      return false
    }
    return undefined
  }

  private parseRetryMode(value?: string | null): S3Config['retryMode'] | undefined {
    const normalized = normalizeStringToUndefined(value)
    if (!normalized) {
      return undefined
    }

    if (normalized === 'standard' || normalized === 'adaptive' || normalized === 'legacy') {
      return normalized
    }

    return undefined
  }

  private ensureUserSettings(config: BuilderConfig): NonNullable<BuilderConfig['user']> {
    if (!config.user) {
      config.user = {
        storage: null,
      }
    }
    return config.user
  }
}
