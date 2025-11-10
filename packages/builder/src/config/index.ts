import { loadConfig } from 'c12'
import consola from 'consola'

import type { StorageConfig } from '../storage/interfaces.js'
import type { BuilderConfig, BuilderConfigInput, UserBuilderSettings } from '../types/config.js'
import { clone } from '../utils/clone.js'
import { createDefaultBuilderConfig } from './defaults.js'

export interface LoadBuilderConfigOptions {
  cwd?: string
  configFile?: string
}

function applySystemOverrides(target: BuilderConfig['system'], overrides?: BuilderConfigInput['system']): void {
  if (!overrides) return

  if (overrides.processing) {
    const { processing } = overrides
    if (typeof processing.defaultConcurrency === 'number') {
      target.processing.defaultConcurrency = processing.defaultConcurrency
    }
    if (typeof processing.enableLivePhotoDetection === 'boolean') {
      target.processing.enableLivePhotoDetection = processing.enableLivePhotoDetection
    }
    if (processing.digestSuffixLength !== undefined) {
      target.processing.digestSuffixLength = processing.digestSuffixLength
    }
    if (processing.supportedFormats) {
      target.processing.supportedFormats = new Set(processing.supportedFormats as Set<string>)
    }
  }

  if (overrides.observability) {
    const { observability } = overrides
    if (typeof observability.showProgress === 'boolean') {
      target.observability.showProgress = observability.showProgress
    }
    if (typeof observability.showDetailedStats === 'boolean') {
      target.observability.showDetailedStats = observability.showDetailedStats
    }
    if (observability.logging) {
      target.observability.logging = {
        ...target.observability.logging,
        ...observability.logging,
      }
    }
    if (observability.performance?.worker) {
      target.observability.performance.worker = {
        ...target.observability.performance.worker,
        ...observability.performance.worker,
      }
    }
  }
}

function ensureUserSettings(target: BuilderConfig): UserBuilderSettings {
  if (!target.user) {
    target.user = {
      repo: {
        enable: false,
        url: '',
        token: '',
      },
      storage: null,
    }
  }
  return target.user
}

function applyUserOverrides(target: BuilderConfig, overrides?: BuilderConfigInput['user']): void {
  if (!overrides) return
  const user = ensureUserSettings(target)

  if (overrides.repo) {
    user.repo = {
      ...user.repo,
      ...overrides.repo,
    }
  }
  if (overrides.storage !== undefined) {
    user.storage = overrides.storage as StorageConfig | null
  }
}

function normalizeBuilderConfig(defaults: BuilderConfig, input: BuilderConfigInput): BuilderConfig {
  const next = clone(defaults)

  applySystemOverrides(next.system, input.system)
  applyUserOverrides(next, input.user)

  if (input.repo) {
    const user = ensureUserSettings(next)
    user.repo = {
      ...user.repo,
      ...input.repo,
    }
  }

  if (input.storage !== undefined) {
    ensureUserSettings(next).storage = input.storage ?? null
  }

  if (Array.isArray(input.plugins)) {
    next.plugins = [...input.plugins]
  }

  return next
}

export function resolveBuilderConfig(input: BuilderConfigInput, base?: BuilderConfig): BuilderConfig {
  const defaults = base ? clone(base) : createDefaultBuilderConfig()
  return normalizeBuilderConfig(defaults, input)
}

export async function loadBuilderConfig(options: LoadBuilderConfigOptions = {}): Promise<BuilderConfig> {
  const result = await loadConfig<BuilderConfigInput>({
    name: 'builder',
    cwd: options.cwd ?? process.cwd(),
    configFile: options.configFile,
    rcFile: false,
    dotenv: false,
  })

  const userConfig = result.config ?? {}

  const config = resolveBuilderConfig(userConfig)

  if (!config.user?.storage) {
    throw new Error('缺失存储配置，请配置 storage 字段')
  }

  if (process.env.DEBUG === '1') {
    const logger = consola.withTag('CONFIG')
    logger.info('Using builder config from', result.configFile ?? 'defaults')
    logger.info(config)
  }

  return config
}
