import os from 'node:os'

import type { BuilderConfig } from '../types/config.js'

export function createDefaultBuilderConfig(): BuilderConfig {
  return {
    system: {
      processing: {
        defaultConcurrency: 10,
        enableLivePhotoDetection: true,
        digestSuffixLength: 0,
      },
      observability: {
        showProgress: true,
        showDetailedStats: true,
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
      },
    },
    user: null!,
    plugins: [],
  }
}
