import type { BuilderConfig, StorageConfig } from '@afilmory/builder'
import { StorageFactory } from '@afilmory/builder'
import { GitHubStorageProvider, S3StorageProvider } from '@afilmory/builder/storage/index.js'
import type { GitHubConfig, S3Config } from '@afilmory/builder/storage/interfaces.js'
import { BizException, ErrorCode } from 'core/errors'
import { BuilderConfigService } from 'core/modules/configuration/builder-config/builder-config.service'
import { SettingService } from 'core/modules/configuration/setting/setting.service'
import type { BuilderStorageProvider } from 'core/modules/configuration/setting/storage-provider.utils'
import { injectable } from 'tsyringe'

import type { PhotoBuilderService } from '../builder/photo-builder.service'

type ResolveOverrides = {
  builderConfig?: BuilderConfig
  storageConfig?: StorageConfig
}

@injectable()
export class PhotoStorageService {
  constructor(
    private readonly settingService: SettingService,
    private readonly builderConfigService: BuilderConfigService,
  ) {}

  async resolveConfigForTenant(
    tenantId: string,
    overrides: ResolveOverrides = {},
  ): Promise<{ builderConfig: BuilderConfig; storageConfig: StorageConfig }> {
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

  registerStorageProviderPlugin(
    builder: ReturnType<PhotoBuilderService['createBuilder']>,
    storageConfig: StorageConfig,
  ): void {
    this.assertProviderSupported(storageConfig.provider)

    switch (storageConfig.provider) {
      case 's3': {
        builder.registerStorageProvider('s3', (config) => new S3StorageProvider(config as S3Config))
        break
      }
      case 'github': {
        builder.registerStorageProvider('github', (config) => new GitHubStorageProvider(config as GitHubConfig))
        break
      }
      default: {
        const provider = (storageConfig as StorageConfig)?.provider as string
        const registered = StorageFactory.getRegisteredProviders()
        if (!registered.includes(provider)) {
          throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
            message: `Unsupported storage provider type: ${provider}`,
          })
        }
      }
    }
  }

  private mapProviderToStorageConfig(provider: BuilderStorageProvider): StorageConfig {
    this.assertProviderSupported(provider.type)

    const config = provider.config ?? {}
    switch (provider.type) {
      case 's3': {
        const bucket = this.requireString(config.bucket, 'Active S3 storage provider is missing `bucket`.')
        const result: S3Config = {
          provider: 's3',
          bucket,
        }

        const region = this.normalizeString(config.region)
        if (region) result.region = region
        const endpoint = this.normalizeString(config.endpoint)
        if (endpoint) result.endpoint = endpoint
        const accessKeyId = this.normalizeString(config.accessKeyId)
        if (accessKeyId) result.accessKeyId = accessKeyId
        const secretAccessKey = this.normalizeString(config.secretAccessKey)
        if (secretAccessKey) result.secretAccessKey = secretAccessKey
        const prefix = this.normalizeString(config.prefix)
        if (prefix) result.prefix = prefix
        const customDomain = this.normalizeString(config.customDomain)
        if (customDomain) result.customDomain = customDomain
        const excludeRegex = this.normalizeString(config.excludeRegex)
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
        const owner = this.requireString(config.owner, 'Active GitHub storage provider is missing `owner`.')
        const repo = this.requireString(config.repo, 'Active GitHub storage provider is missing `repo`.')

        const result: GitHubConfig = {
          provider: 'github',
          owner,
          repo,
        }

        const branch = this.normalizeString(config.branch)
        if (branch) result.branch = branch
        const token = this.normalizeString(config.token)
        if (token) result.token = token
        const pathValue = this.normalizeString(config.path)
        if (pathValue) result.path = pathValue
        const useRawUrl = this.parseBoolean(config.useRawUrl)
        if (typeof useRawUrl === 'boolean') result.useRawUrl = useRawUrl

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
    if (provider === 'local' || provider === 'eagle') {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: `云端服务不支持 ${provider === 'local' ? 'Local' : 'Eagle'} 存储提供商`,
      })
    }
  }

  private normalizeString(value?: string | null): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  private parseNumber(value?: string | null): number | undefined {
    const normalized = this.normalizeString(value)
    if (!normalized) {
      return undefined
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private parseBoolean(value?: string | null): boolean | undefined {
    const normalized = this.normalizeString(value)
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
    const normalized = this.normalizeString(value)
    if (!normalized) {
      return undefined
    }

    if (normalized === 'standard' || normalized === 'adaptive' || normalized === 'legacy') {
      return normalized
    }

    return undefined
  }

  private requireString(value: string | undefined | null, message: string): string {
    const normalized = this.normalizeString(value)
    if (!normalized) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message })
    }
    return normalized
  }

  private ensureUserSettings(config: BuilderConfig) {
    if (!config.user) {
      config.user = {
        repo: {
          enable: false,
          url: '',
          token: '',
        },
        storage: null,
      }
    }
    return config.user
  }
}
