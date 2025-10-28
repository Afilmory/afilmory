import cluster from 'node:cluster'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { inspect } from 'node:util'

import type { BuilderConfig } from '@afilmory/builder'
import consola from 'consola'
import { merge } from 'es-toolkit'

import { env } from './env.js'

export const defaultBuilderConfig: BuilderConfig = {
  repo: {
    enable: false,
    url: '',
    token: env.GIT_TOKEN,
  },

  storage: {
    provider: 's3',
    bucket: '',
    region: '',
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
    prefix: 'photos/',
    customDomain: '',
    excludeRegex: '',
    maxFileLimit: 1000,
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

  const envConfig = {
    repo: {
      token: env.GIT_TOKEN,
    },
    storage: {
      bucket: env.S3_BUCKET_NAME,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      prefix: env.S3_PREFIX,
      customDomain: env.S3_CUSTOM_DOMAIN,
      excludeRegex: env.S3_EXCLUDE_REGEX,
    },
  }

  return merge(defaultBuilderConfig, merge(userConfig, envConfig))
}

export const builderConfig: BuilderConfig = readUserConfig()

if (cluster.isPrimary && process.env.DEBUG === '1') {
  const logger = consola.withTag('CONFIG')
  logger.info('Your builder config:')
  logger.info(inspect(builderConfig, { depth: null, colors: true }))
}
