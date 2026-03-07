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
  mapProjection?: 'globe' | 'mercator'
  beian?: BeianConfig
}

/**
 * ICP备案配置（中国大陆网站备案）
 */
interface ICPBeian {
  /** 是否启用ICP备案显示 */
  enabled?: boolean
  /** ICP备案号 */
  number?: string
  /** ICP备案查询链接（默认：https://beian.miit.gov.cn/） */
  link?: string
}

/**
 * 公安备案配置
 */
interface PoliceBeian {
  /** 是否启用公安备案显示 */
  enabled?: boolean
  /** 公安备案号文本 */
  number?: string
  /** 公安备案代码（用于查询链接） */
  code?: string
  /** 公安备案图标链接 */
  icon?: string
}

/**
 * 备案配置（中国大陆网站需要）
 */
interface BeianConfig {
  /** ICP备案配置 */
  icp?: ICPBeian
  /** 公安备案配置 */
  police?: PoliceBeian
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
  name: 'New Afilmory',
  title: 'New Afilmory',
  description: 'A modern photo gallery website.',
  url: 'https://afilmory.art',
  accentColor: '#007bff',
  author: {
    name: 'Afilmory',
    url: 'https://afilmory.art/',
    avatar: 'https://cdn.jsdelivr.net/gh/Afilmory/Afilmory@main/logo.jpg',
  },
}
export const siteConfig: SiteConfig = merge(defaultConfig, userConfig) as any

export default siteConfig
