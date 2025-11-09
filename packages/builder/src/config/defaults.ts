import os from 'node:os'

import type { BuilderConfig } from '../types/config.js'

export function createDefaultBuilderConfig(): BuilderConfig {
  return {
    repo: {
      enable: false,
      url: '',
      token: '',
    },
    storage: null!,
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
        timeout: 30_000,
        useClusterMode: true,
        workerConcurrency: 2,
      },
    },
    plugins: [],
  }
}
