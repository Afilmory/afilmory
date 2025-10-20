import cluster from 'node:cluster'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { inspect } from 'node:util'

import type { StorageConfig } from '@afilmory/builder'
import consola from 'consola'
import { merge } from 'es-toolkit'

import { env } from './env.js'

export interface BuilderConfig {
  // 远程仓库的地址
  repo: {
    enable: boolean
    url: string
    // Git token for pushing updates back to the repository
    token?: string
  }
  // 存储配置
  storage: StorageConfig

  // 构建器选项
  options: {
    // 默认并发限制
    defaultConcurrency: number

    // 支持的图片格式（可以覆盖默认的 SUPPORTED_FORMATS）
    supportedFormats?: Set<string>

    // Live Photo 检测是否启用
    enableLivePhotoDetection: boolean

    // 是否启用进度显示
    showProgress: boolean

    // 是否在构建完成后显示详细统计
    showDetailedStats: boolean

    // 摘要后缀长度（0表示不添加后缀，>0表示添加sha256摘要的前N个字符作为后缀）
    digestSuffixLength?: number
  }

  // 日志配置
  logging: {
    // 是否启用详细日志
    verbose: boolean

    // 日志级别：'info' | 'warn' | 'error' | 'debug'
    level: 'info' | 'warn' | 'error' | 'debug'

    // 是否将日志输出到文件
    outputToFile: boolean

    // 日志文件路径（如果 outputToFile 为 true）
    logFilePath?: string
  }

  // 性能优化配置
  performance: {
    // Worker 池配置
    worker: {
      // Worker 超时时间（毫秒）
      timeout: number

      // 是否使用 cluster 模式（多进程）而不是线程池
      useClusterMode: boolean

      // 每个 worker 内部的并发数（cluster 模式下生效）
      workerConcurrency: number

      // Worker 数量
      workerCount: number
    }
  }
}

const buildDefaultThumbnailPrefix = (prefix?: string | null): string => {
  if (!prefix) {
    return 'thumbnails/'
  }

  const sanitized = prefix.replaceAll(/\/+$/g, '')
  if (!sanitized) {
    return 'thumbnails/'
  }

  return `${sanitized}/thumbnails/`
}

export const defaultBuilderConfig: BuilderConfig = {
  repo: {
    enable: false,
    url: '',
    token: env.GIT_TOKEN,
  },

  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    customDomain: env.S3_CUSTOM_DOMAIN,
    excludeRegex: env.S3_EXCLUDE_REGEX,
    maxFileLimit: 1000,
    uploadThumbnails: false,
    thumbnailPrefix: buildDefaultThumbnailPrefix(env.S3_PREFIX),
    // Network tuning defaults
    keepAlive: true,
    maxSockets: 64,
    connectionTimeoutMs: 5_000,
    socketTimeoutMs: 30_000,
    requestTimeoutMs: 20_000,
    idleTimeoutMs: 10_000,
    totalTimeoutMs: 60_000,
    retryMode: 'standard',
    maxAttempts: 3,
    downloadConcurrency: 16,
  },

  options: {
    defaultConcurrency: 10,
    enableLivePhotoDetection: true,
    showProgress: true,
    showDetailedStats: true,
    digestSuffixLength: 0,
  },

  logging: {
    verbose: false,
    level: 'info',
    outputToFile: false,
  },

  performance: {
    worker: {
      workerCount: os.cpus().length * 2,
      timeout: 30000, // 30 seconds
      useClusterMode: true,
      workerConcurrency: 2,
    },
  },
}

const readUserConfig = () => {
  const isUserConfigExist = existsSync(
    new URL('builder.config.json', import.meta.url),
  )
  if (!isUserConfigExist) {
    return defaultBuilderConfig
  }

  const userConfig = JSON.parse(
    readFileSync(new URL('builder.config.json', import.meta.url), 'utf-8'),
  ) as BuilderConfig

  return merge(defaultBuilderConfig, userConfig)
}

export const builderConfig: BuilderConfig = readUserConfig()

if (cluster.isPrimary && process.env.DEBUG === '1') {
  const logger = consola.withTag('CONFIG')
  logger.info('Your builder config:')
  logger.info(inspect(builderConfig, { depth: null, colors: true }))
}
