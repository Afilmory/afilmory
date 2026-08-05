import { env } from '@afilmory/env'

export function getAppStoreEnvironment(): 'production' | 'sandbox' {
  return env.NODE_ENV === 'production' ? 'production' : 'sandbox'
}

export function getCreemEnvironment(): 'production' | 'test' {
  return env.NODE_ENV === 'production' ? 'production' : 'test'
}

export function normalizeAppStoreEnvironment(value: string | null | undefined): 'production' | 'sandbox' | null {
  switch (value?.trim().toLowerCase()) {
    case 'production': {
      return 'production'
    }
    case 'sandbox':
    case 'xcode':
    case 'localtesting': {
      return 'sandbox'
    }
    default: {
      return null
    }
  }
}
