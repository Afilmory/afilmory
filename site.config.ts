import { merge } from 'es-toolkit/compat'

import userConfig from './config.json'

export interface SiteConfig {
  name: string
  title: string
  description: string
  url: string
  accentColor: string
  author: Author
  social?: Social
  feed?: Feed
  map?: MapConfig
  mapStyle?: string
}

/**
 * Map configuration - can be either:
 * - A string for a single provider: 'maplibre'
 * - An array for multiple providers in priority order: ['maplibre']
 */
type MapConfig = 'maplibre'[]

interface Feed {
  folo?: {
    challenge?: {
      feedId: string
      userId: string
    }
  }
}
interface Author {
  name: string
  url: string
  avatar?: string
}
interface Social {
  twitter?: string
  github?: string
}

const defaultConfig: SiteConfig = {
  name: "Innei's Afilmory",
  title: "Innei's Afilmory",
  description:
    'Capturing beautiful moments in life, documenting daily warmth and emotions through my lens.',
  url: 'https://afilmory.innei.in',
  accentColor: '#007bff',
  author: {
    name: 'Innei',
    url: 'https://innei.in/',
    avatar: 'https://cdn.jsdelivr.net/gh/Innei/static@master/avatar.png',
  },
}
export const siteConfig: SiteConfig = merge(defaultConfig, userConfig) as any

export default siteConfig
