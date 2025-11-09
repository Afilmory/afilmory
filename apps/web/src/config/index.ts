import type { SiteConfig } from '@config'
import defaultSiteConfig from '@config'
import { merge } from 'es-toolkit/compat'

const defaultInjectConfig = {
  useApi: false,
  useNext: false,
  useCloud: false,
}

export const injectConfig = merge(defaultInjectConfig, __CONFIG__)

const getInjectedSiteConfig = (): Partial<SiteConfig> | undefined => {
  if (typeof window !== 'undefined' && window.__SITE_CONFIG__) {
    return window.__SITE_CONFIG__
  }

  if (typeof globalThis !== 'undefined' && '__SITE_CONFIG__' in globalThis) {
    return (globalThis as typeof globalThis & { __SITE_CONFIG__?: Partial<SiteConfig> }).__SITE_CONFIG__
  }

  return undefined
}

const runtimeSiteConfig = getInjectedSiteConfig() ?? {}

export const siteConfig: SiteConfig = merge(defaultSiteConfig, runtimeSiteConfig)
