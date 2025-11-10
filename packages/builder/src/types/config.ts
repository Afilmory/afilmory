import type { BuilderPluginConfigEntry } from '../plugins/types.js'
import type { StorageConfig } from '../storage/interfaces.js'

export interface BuilderRepoSettings {
  enable: boolean
  url: string
  token?: string
}

export interface LoggingConfig {
  verbose: boolean
  level: 'info' | 'warn' | 'error' | 'debug'
  outputToFile: boolean
  logFilePath?: string
}

export interface WorkerPerformanceConfig {
  timeout: number
  useClusterMode: boolean
  workerConcurrency: number
  workerCount: number
}

export interface SystemProcessingSettings {
  defaultConcurrency: number
  enableLivePhotoDetection: boolean
  supportedFormats?: Set<string>
  digestSuffixLength?: number
}

export interface SystemObservabilitySettings {
  showProgress: boolean
  showDetailedStats: boolean
  logging: LoggingConfig
  performance: {
    worker: WorkerPerformanceConfig
  }
}

export interface SystemBuilderSettings {
  processing: SystemProcessingSettings
  observability: SystemObservabilitySettings
}

export interface UserBuilderSettings {
  repo: BuilderRepoSettings
  storage: StorageConfig | null
}

export interface BuilderConfig {
  system: SystemBuilderSettings
  user: UserBuilderSettings | null
  plugins: BuilderPluginConfigEntry[]
}

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type BuilderConfigInput = DeepPartial<Omit<UserBuilderSettings, 'storage'>> & {
  storage?: StorageConfig | null
  user?: DeepPartial<UserBuilderSettings>
  system?: DeepPartial<SystemBuilderSettings>
  plugins?: BuilderPluginConfigEntry[]
}
