import type { BuilderConfig, StorageConfig } from '@afilmory/builder'
import { LOCAL_STORAGE_PROVIDERS } from '@afilmory/builder/storage/index.js'
import type {
  B2Config,
  GitHubConfig,
  LocalStorageProviderName,
  ManagedStorageConfig,
  RemoteStorageConfig,
  S3CompatibleConfig,
} from '@afilmory/builder/storage/interfaces.js'
import { BizException, ErrorCode } from '@core/errors'
import {
  normalizeStringToUndefined,
  parseBoolean,
  parseNumber,
  requireStringWithMessage,
} from '@core/helpers/normalize.helper'
import { BuilderConfigService } from '@core/modules/configuration/builder-config/builder-config.service'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import type { BuilderStorageProvider } from '@core/modules/configuration/setting/storage-provider.utils'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { StoragePlanService } from '@core/modules/platform/billing/plan/storage-plan.service'
import { injectable } from 'tsyringe'

import { parseRetryMode } from './storage-config-parser.utils'

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
  ): Promise<{ builderConfig: BuilderConfig, storageConfig: StorageConfig }> {
    const activeProviderIdRaw = await this.settingService.get('builder.storage.activeProvider', { tenantId })
    const activeProviderId
      = typeof activeProviderIdRaw === 'string' && activeProviderIdRaw.trim().length > 0
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

    if (activeProviderId === MANAGED_ACTIVE_PROVIDER_ID) {
      const managedConfig = await this.tryResolveManagedStorageConfig(tenantId)
      if (managedConfig) {
        const builderConfig = await this.builderConfigService.getConfigForTenant(tenantId)
        const userSettings = this.ensureUserSettings(builderConfig)
        userSettings.storage = managedConfig
        return { builderConfig, storageConfig: managedConfig }
      }
    }

    const activeProvider = await this.settingService.getActiveStorageProvider({ tenantId })
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
      this.storagePlanService.getActivePlanSummaryForTenant(tenantId),
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

  mapProviderToStorageConfig(provider: BuilderStorageProvider): StorageConfig {
    this.assertProviderSupported(provider.type)

    const config = provider.config ?? {}
    switch (provider.type) {
      case 's3':
      case 'oss':
      case 'cos': {
        const providerLabel = provider.type.toUpperCase()
        const bucket = requireStringWithMessage(
          config.bucket,
          `Active ${providerLabel} storage provider is missing \`bucket\`.`,
        )
        const result: S3CompatibleConfig = {
          provider: provider.type as S3CompatibleConfig['provider'],
          bucket,
        }

        const region = normalizeStringToUndefined(config.region)
        if (region)
          result.region = region
        const endpoint = normalizeStringToUndefined(config.endpoint)
        if (endpoint)
          result.endpoint = endpoint
        const accessKeyId = normalizeStringToUndefined(config.accessKeyId)
        if (accessKeyId)
          result.accessKeyId = accessKeyId
        const secretAccessKey = normalizeStringToUndefined(config.secretAccessKey)
        if (secretAccessKey)
          result.secretAccessKey = secretAccessKey

        const prefix = normalizeStringToUndefined(config.prefix)
        if (prefix)
          result.prefix = prefix
        const customDomain = normalizeStringToUndefined(config.customDomain)
        if (customDomain)
          result.customDomain = customDomain
        const excludeRegex = normalizeStringToUndefined(config.excludeRegex)
        if (excludeRegex)
          result.excludeRegex = excludeRegex

        const maxFileLimit = parseNumber(config.maxFileLimit)
        if (typeof maxFileLimit === 'number')
          result.maxFileLimit = maxFileLimit
        const keepAlive = parseBoolean(config.keepAlive)
        if (typeof keepAlive === 'boolean')
          result.keepAlive = keepAlive
        const maxSockets = parseNumber(config.maxSockets)
        if (typeof maxSockets === 'number')
          result.maxSockets = maxSockets
        const connectionTimeoutMs = parseNumber(config.connectionTimeoutMs)
        if (typeof connectionTimeoutMs === 'number')
          result.connectionTimeoutMs = connectionTimeoutMs
        const socketTimeoutMs = parseNumber(config.socketTimeoutMs)
        if (typeof socketTimeoutMs === 'number')
          result.socketTimeoutMs = socketTimeoutMs
        const requestTimeoutMs = parseNumber(config.requestTimeoutMs)
        if (typeof requestTimeoutMs === 'number')
          result.requestTimeoutMs = requestTimeoutMs
        const idleTimeoutMs = parseNumber(config.idleTimeoutMs)
        if (typeof idleTimeoutMs === 'number')
          result.idleTimeoutMs = idleTimeoutMs
        const totalTimeoutMs = parseNumber(config.totalTimeoutMs)
        if (typeof totalTimeoutMs === 'number')
          result.totalTimeoutMs = totalTimeoutMs
        const retryMode = parseRetryMode(config.retryMode)
        if (retryMode)
          result.retryMode = retryMode
        const maxAttempts = parseNumber(config.maxAttempts)
        if (typeof maxAttempts === 'number')
          result.maxAttempts = maxAttempts
        const downloadConcurrency = parseNumber(config.downloadConcurrency)
        if (typeof downloadConcurrency === 'number')
          result.downloadConcurrency = downloadConcurrency
        const sigV4Service = normalizeStringToUndefined(config.sigV4Service)
        if (sigV4Service)
          result.sigV4Service = sigV4Service

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
        if (branch)
          result.branch = branch
        const token = normalizeStringToUndefined(config.token)
        if (token)
          result.token = token
        const pathValue = normalizeStringToUndefined(config.path)
        if (pathValue)
          result.path = pathValue
        const useRawUrl = parseBoolean(config.useRawUrl)
        if (typeof useRawUrl === 'boolean')
          result.useRawUrl = useRawUrl
        const customDomain = normalizeStringToUndefined(config.customDomain)
        if (customDomain)
          result.customDomain = customDomain

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
        if (prefix)
          result.prefix = prefix
        const customDomain = normalizeStringToUndefined(config.customDomain)
        if (customDomain)
          result.customDomain = customDomain
        const excludeRegex = normalizeStringToUndefined(config.excludeRegex)
        if (excludeRegex)
          result.excludeRegex = excludeRegex

        const maxFileLimit = parseNumber(config.maxFileLimit)
        if (typeof maxFileLimit === 'number')
          result.maxFileLimit = maxFileLimit
        const authorizationTtlMs = parseNumber(config.authorizationTtlMs)
        if (typeof authorizationTtlMs === 'number')
          result.authorizationTtlMs = authorizationTtlMs
        const uploadUrlTtlMs = parseNumber(config.uploadUrlTtlMs)
        if (typeof uploadUrlTtlMs === 'number')
          result.uploadUrlTtlMs = uploadUrlTtlMs

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

  private ensureUserSettings(config: BuilderConfig): NonNullable<BuilderConfig['user']> {
    if (!config.user) {
      config.user = {
        storage: null,
      }
    }
    return config.user
  }
}
