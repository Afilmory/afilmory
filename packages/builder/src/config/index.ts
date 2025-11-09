import { loadConfig } from 'c12'
import consola from 'consola'
import { merge } from 'es-toolkit'

import type { BuilderConfig, BuilderConfigInput } from '../types/config.js'
import { clone } from '../utils/clone.js'
import { createDefaultBuilderConfig } from './defaults.js'

export interface LoadBuilderConfigOptions {
  cwd?: string
  configFile?: string
}

function normalizeBuilderConfig(defaults: BuilderConfig, input: BuilderConfigInput): BuilderConfig {
  const base = clone(defaults)
  const merged = merge(base, input as Record<string, unknown>) as BuilderConfig

  if (input.storage) {
    merged.storage = input.storage as BuilderConfig['storage']
  }

  if (Array.isArray(input.plugins)) {
    merged.plugins = [...input.plugins]
  } else if (!Array.isArray(merged.plugins)) {
    merged.plugins = []
  }

  return merged
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

  const defaults = createDefaultBuilderConfig()
  const config = normalizeBuilderConfig(defaults, userConfig)

  if (!config.storage) {
    throw new Error('缺失存储配置，请配置 storage 字段')
  }

  if (process.env.DEBUG === '1') {
    const logger = consola.withTag('CONFIG')
    logger.info('Using builder config from', result.configFile ?? 'defaults')
    logger.info(config)
  }

  return config
}
