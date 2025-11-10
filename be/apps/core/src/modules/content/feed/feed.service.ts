import { createHash } from 'node:crypto'

import type { OnModuleDestroy, OnModuleInit } from '@afilmory/framework'
import { createLogger, EventEmitterService, HttpContext } from '@afilmory/framework'
import type { FeedSiteConfig } from '@afilmory/utils'
import { generateRSSFeed } from '@afilmory/utils'
import { SiteSettingService } from 'core/modules/configuration/site-setting/site-setting.service'
import { SITE_SETTING_KEYS } from 'core/modules/configuration/site-setting/site-setting.type'
import { ManifestService } from 'core/modules/content/manifest/manifest.service'
import type { CacheRememberOptions } from 'core/modules/infrastructure/cache/cache.service'
import { CacheService } from 'core/modules/infrastructure/cache/cache.service'
import { requireTenantContext } from 'core/modules/platform/tenant/tenant.context'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

const CACHE_PREFIX = 'core:feed:rss'
const CACHE_VERSION = 'v1'
const CACHE_TTL_SECONDS = 300
const CACHE_STALE_SECONDS = 120

const logger = createLogger('FeedService')
const SITE_SETTING_KEY_SET = new Set<string>(SITE_SETTING_KEYS)

export interface FeedDocument {
  xml: string
  generatedAt: string
  lastPublishedAt: string | null
  etag: string
  itemCount: number
}

@injectable()
export class FeedService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly cacheService: CacheService,
    private readonly siteSettingService: SiteSettingService,
    private readonly manifestService: ManifestService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.eventEmitter.on('setting.updated', this.handleSettingMutated)
    this.eventEmitter.on('setting.deleted', this.handleSettingMutated)
    this.eventEmitter.on('photo.manifest.changed', this.handleManifestChanged)
  }

  async onModuleDestroy(): Promise<void> {
    this.eventEmitter.off('setting.updated', this.handleSettingMutated)
    this.eventEmitter.off('setting.deleted', this.handleSettingMutated)
    this.eventEmitter.off('photo.manifest.changed', this.handleManifestChanged)
  }

  private readonly handleSettingMutated = ({ tenantId, key }: { tenantId: string; key: string }) => {
    if (!SITE_SETTING_KEY_SET.has(key)) {
      return
    }
    void this.invalidateCacheForTenant(tenantId, 'site-setting-updated')
  }

  private readonly handleManifestChanged = ({ tenantId }: { tenantId: string }) => {
    void this.invalidateCacheForTenant(tenantId, 'photo-manifest-changed')
  }

  async getFeedDocument(): Promise<FeedDocument> {
    const tenant = requireTenantContext()
    const cacheKey = this.createCacheKey(tenant.tenant.id)

    const options: CacheRememberOptions<FeedDocument> = {
      ttlSeconds: CACHE_TTL_SECONDS,
      skipCacheWhen: (value) => !value || value.xml.length === 0,
    }

    return await this.cacheService.rememberJson(cacheKey, async () => await this.buildFeedDocument(), options)
  }

  createOkResponse(document: FeedDocument): Response {
    const headers = this.createBaseHeaders(document)
    headers.set('content-length', Buffer.byteLength(document.xml, 'utf8').toString())
    return new Response(document.xml, {
      status: 200,
      headers,
    })
  }

  createNotModifiedResponse(document: FeedDocument): Response {
    const headers = this.createBaseHeaders(document)
    headers.delete('content-length')
    return new Response(null, {
      status: 304,
      headers,
    })
  }

  private createCacheKey(tenantId: string): string {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${tenantId}`
  }

  private async invalidateCacheForTenant(tenantId: string, reason: string): Promise<void> {
    if (!tenantId) {
      return
    }
    const cacheKey = this.createCacheKey(tenantId)
    await this.cacheService.delete(cacheKey)
    logger.debug('Invalidated feed cache for tenant', { tenantId, reason, cacheKey })
  }

  private async buildFeedDocument(): Promise<FeedDocument> {
    const [manifest, siteConfig] = await Promise.all([
      this.manifestService.getManifest(),
      this.siteSettingService.getSiteConfig(),
    ])

    const baseUrl = this.resolveBaseUrl(siteConfig.url)
    const feedConfig: FeedSiteConfig = {
      title: siteConfig.title,
      description: siteConfig.description,
      url: baseUrl,
      author: {
        name: siteConfig.author.name,
        url: siteConfig.author.url,
        avatar: siteConfig.author.avatar ?? null,
      },
      feed: siteConfig.feed,
    }

    const xml = generateRSSFeed(manifest.data, feedConfig)
    const lastPublishedAt = this.resolveLastPublishedAt(manifest.data[0]?.dateTaken)
    const generatedAt = new Date().toUTCString()
    const etag = this.createEtag(xml)

    return {
      xml,
      generatedAt,
      lastPublishedAt,
      etag,
      itemCount: manifest.data.length,
    }
  }

  private createBaseHeaders(document: FeedDocument): Headers {
    const headers = new Headers()
    headers.set('content-type', 'application/rss+xml; charset=utf-8')
    headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_STALE_SECONDS}`)
    headers.set('etag', document.etag)
    headers.set('x-feed-items', document.itemCount.toString())
    headers.set('x-generated-at', document.generatedAt)

    const lastModified = document.lastPublishedAt ?? document.generatedAt
    headers.set('last-modified', lastModified)
    headers.set('vary', 'accept, accept-encoding')

    return headers
  }

  private resolveBaseUrl(candidate?: string | null): string {
    const normalized = this.normalizeUrl(candidate)
    if (normalized) {
      return normalized
    }

    const context = this.getHttpContext()
    const derived = context ? this.deriveOriginFromRequest(context) : null
    if (derived) {
      return derived
    }

    logger.warn('Site URL is not configured; falling back to localhost origin for feed generation.')
    return 'http://localhost'
  }

  private createEtag(payload: string): string {
    const hash = createHash('sha256').update(payload).digest('hex')
    return `W/"${hash}"`
  }

  private resolveLastPublishedAt(dateTaken?: string | null): string | null {
    if (!dateTaken) {
      return null
    }
    const timestamp = Date.parse(dateTaken)
    if (Number.isNaN(timestamp)) {
      return null
    }
    return new Date(timestamp).toUTCString()
  }

  private normalizeUrl(url?: string | null): string | null {
    if (!url) {
      return null
    }
    const trimmed = url.trim()
    if (!trimmed) {
      return null
    }
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
  }

  private getHttpContext(): Context | null {
    try {
      return (HttpContext.getValue('hono') as Context | undefined) ?? null
    } catch {
      return null
    }
  }

  private deriveOriginFromRequest(context: Context): string | null {
    const forwardedProto = context.req.header('x-forwarded-proto')
    const forwardedHost = context.req.header('x-forwarded-host')
    const host = this.normalizeHost(forwardedHost ?? context.req.header('host'))

    if (host) {
      const protocol = forwardedProto?.trim().toLowerCase() || (host.startsWith('localhost') ? 'http' : 'https')
      return `${protocol}://${host}`
    }

    try {
      const url = new URL(context.req.url)
      return `${url.protocol}//${url.host}`
    } catch {
      return null
    }
  }

  private normalizeHost(host: string | null | undefined): string | null {
    if (!host) {
      return null
    }
    return host.trim().replace(/\/+$/, '') || null
  }
}
