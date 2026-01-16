import type { BuilderPluginConfigEntry } from '../plugins/types.js'
import type { StorageConfig } from '../storage/interfaces.js'

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
  /**
   * Do not process input images where the number of pixels (width x height) exceeds this limit.
   * - `number`: An integral Number of pixels as the limit
   * - `false` or `0`: Remove limit entirely
   * - `true` or `undefined`: Use sharp's default limit of 268402689 (0x3FFF x 0x3FFF)
   * @default undefined (uses sharp's default: 268402689)
   */
  limitInputPixels?: number | boolean
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

export type BuilderConfigInput = {
  storage?: StorageConfig | null
  user?: DeepPartial<UserBuilderSettings>
  system?: DeepPartial<SystemBuilderSettings>
  plugins?: BuilderPluginConfigEntry[]
}
