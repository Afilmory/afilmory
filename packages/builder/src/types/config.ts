import type { BuilderPluginConfigEntry } from '../plugins/types.js'
import type { StorageConfig } from '../storage/interfaces.js'

export interface BuilderConfig {
  repo: {
    enable: boolean
    url: string
    token?: string
  }
  storage: StorageConfig
  options: {
    defaultConcurrency: number
    supportedFormats?: Set<string>
    enableLivePhotoDetection: boolean
    showProgress: boolean
    showDetailedStats: boolean
    digestSuffixLength?: number
  }
  logging: {
    verbose: boolean
    level: 'info' | 'warn' | 'error' | 'debug'
    outputToFile: boolean
    logFilePath?: string
  }
  performance: {
    worker: {
      timeout: number
      useClusterMode: boolean
      workerConcurrency: number
      workerCount: number
    }
  }
  plugins?: BuilderPluginConfigEntry[]
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export type BuilderConfigInput = DeepPartial<Omit<BuilderConfig, 'plugins'>> & {
  plugins?: BuilderPluginConfigEntry[]
}
