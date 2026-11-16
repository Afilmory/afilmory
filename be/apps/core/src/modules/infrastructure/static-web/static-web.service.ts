import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PhotoManifestItem } from '@afilmory/builder'
import { escapeJsonForScript } from '@afilmory/utils/escape-json-for-script'
import { SiteSettingService } from '@core/modules/configuration/site-setting/site-setting.service'
import { ManifestService } from '@core/modules/content/manifest/manifest.service'
import type { Context } from 'hono'
import { DOMParser } from 'linkedom'
import { injectable } from 'tsyringe'

import type { StaticAssetDocument } from './static-asset.service'
import { StaticAssetService } from './static-asset.service'
import { StaticAssetHostService } from './static-asset-host.service'

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))

const STATIC_WEB_ROUTE_SEGMENT = '/static/web'

const STATIC_WEB_ROOT_CANDIDATES = Array.from(
  new Set(
    [
      resolve(MODULE_DIR, '../../static/web'),
      resolve(process.cwd(), 'dist/static/web'),
      resolve(process.cwd(), '../dist/static/web'),
      resolve(process.cwd(), '../../dist/static/web'),
      resolve(process.cwd(), '../../../dist/static/web'),
      resolve(process.cwd(), 'static/web'),
      resolve(process.cwd(), '../static/web'),
      resolve(process.cwd(), '../../static/web'),
      resolve(process.cwd(), '../../../static/web'),
      resolve(process.cwd(), 'apps/web/dist'),
      resolve(process.cwd(), '../apps/web/dist'),
      resolve(process.cwd(), '../../apps/web/dist'),
      resolve(process.cwd(), '../../../apps/web/dist'),
    ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ),
)

const DOM_PARSER = new DOMParser()
const STATIC_WEB_ASSET_LINK_RELS = [
  'stylesheet',
  'modulepreload',
  'preload',
  'prefetch',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'manifest',
]

type TenantSiteConfig = Awaited<ReturnType<SiteSettingService['getSiteConfig']>>

@injectable()
export class StaticWebService extends StaticAssetService {
  constructor(
    private readonly manifestService: ManifestService,
    private readonly siteSettingService: SiteSettingService,
    private readonly staticAssetHostService: StaticAssetHostService,
  ) {
    super({
      routeSegment: STATIC_WEB_ROUTE_SEGMENT,
      rootCandidates: STATIC_WEB_ROOT_CANDIDATES,
      assetLinkRels: STATIC_WEB_ASSET_LINK_RELS,
      loggerName: 'StaticWebService',
      staticAssetHostResolver: (requestHost) => this.staticAssetHostService.getStaticAssetHost(requestHost),
      devBuildCommand: {
        command: 'pnpm --filter @afilmory/web build',
        env: { BUILD_FOR_SERVER_SERVE: '1', AFILMORY_EMBED_MANIFEST: 'false' },
      },
    })
  }

  protected override async decorateDocument(document: StaticAssetDocument): Promise<void> {
    const siteConfig = await this.siteSettingService.getSiteConfig()
    this.injectConfigScript(document, siteConfig)
    this.injectSiteMetadata(document, siteConfig)
    await this.injectManifestScript(document)
  }

  async decoratePhotoPageResponse(context: Context, photoId: string, response: Response): Promise<Response> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/html')) {
      return response
    }

    const html = await response.text()
    const headers = new Headers(response.headers)
    const photo = await this.findPhoto(photoId)
    if (!photo) {
      return this.createManualHtmlResponse(html, headers, 404)
    }

    const siteConfig = await this.siteSettingService.getSiteConfig()
    const siteTitle = siteConfig.title?.trim() || siteConfig.name || 'Photo Gallery'
    const origin = this.resolveRequestOrigin(context)
    if (!origin) {
      return this.createManualHtmlResponse(html, headers, response.status)
    }

    try {
      const document = DOM_PARSER.parseFromString(html, 'text/html') as unknown as StaticAssetDocument
      this.removeExistingSocialMeta(document)
      this.updateDocumentTitle(document, `${photo.id} | ${siteTitle}`)
      this.insertSocialMetaTags(document, {
        title: `${photo.id} on ${siteTitle}`,
        description: photo.description || '',
        image: `${origin}/og/${photo.id}`,
        url: `${origin}/${photo.id}`,
      })
      this.injectFaviconLinks(document)

      const serialized = document.documentElement.outerHTML
      return this.createManualHtmlResponse(serialized, headers, 200)
    } catch (error) {
      this.logger.error('Failed to inject Open Graph tags for photo page', { error })
      return this.createManualHtmlResponse(html, headers, response.status)
    }
  }

  async decorateHomepageResponse(context: Context, response: Response): Promise<Response> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/html')) {
      return response
    }

    const html = await response.text()
    const headers = new Headers(response.headers)
    const siteConfig = await this.siteSettingService.getSiteConfig()
    const siteTitle = siteConfig.title?.trim() || siteConfig.name || 'Photo Gallery'
    const origin = this.resolveRequestOrigin(context)
    if (!origin) {
      return this.createManualHtmlResponse(html, headers, response.status)
    }

    try {
      const document = DOM_PARSER.parseFromString(html, 'text/html') as unknown as StaticAssetDocument
      this.removeExistingSocialMeta(document)
      const description = siteConfig.description?.trim() || ''
      this.insertSocialMetaTags(document, {
        title: siteTitle,
        description,
        image: `${origin}/og`,
        url: origin,
      })
      this.injectFaviconLinks(document)

      const serialized = document.documentElement.outerHTML
      return this.createManualHtmlResponse(serialized, headers, 200)
    } catch (error) {
      this.logger.error('Failed to inject Open Graph tags for homepage', { error })
      return this.createManualHtmlResponse(html, headers, response.status)
    }
  }

  private injectConfigScript(document: StaticAssetDocument, siteConfig: TenantSiteConfig): void {
    const configScript = document.head?.querySelector('#config')
    if (!configScript) {
      return
    }

    const payload = JSON.stringify({
      useCloud: true,
    })
    const siteConfigPayload = escapeJsonForScript(JSON.stringify(siteConfig))
    configScript.textContent = `window.__CONFIG__ = ${payload};window.__SITE_CONFIG__ = ${siteConfigPayload}`
  }

  private injectSiteMetadata(document: StaticAssetDocument, siteConfig: TenantSiteConfig): void {
    const normalize = (value: string | undefined) => value?.trim() ?? ''

    const title = normalize(siteConfig.title)
    const description = normalize(siteConfig.description)

    if (title) {
      const titleElement = document.querySelector('title')
      if (titleElement) {
        titleElement.textContent = title
      }

      const appleTitleMeta = document.head?.querySelector('meta[name="apple-mobile-web-app-title"]')
      if (appleTitleMeta) {
        appleTitleMeta.setAttribute('content', title)
      }

      const splashTitle = document.querySelector('#splash-screen h1')
      if (splashTitle) {
        splashTitle.textContent = title
      }
    }

    if (description) {
      const descriptionMeta = document.head?.querySelector('meta[name="description"]')
      if (descriptionMeta) {
        descriptionMeta.setAttribute('content', description)
      }

      const splashDescription = document.querySelector('#splash-screen p')
      if (splashDescription) {
        splashDescription.textContent = description
      }
    }
  }

  private async injectManifestScript(document: StaticAssetDocument): Promise<void> {
    const manifestScript = document.head?.querySelector('#manifest')
    if (!manifestScript) {
      return
    }

    const manifest = await this.manifestService.getManifest()
    manifestScript.textContent = `window.__MANIFEST__ = ${escapeJsonForScript(JSON.stringify(manifest))};`
  }

  private async findPhoto(photoId: string): Promise<PhotoManifestItem | null> {
    const manifest = await this.manifestService.getManifest()
    const target = manifest.data.find((item) => item.id === photoId)
    return target ?? null
  }

  private resolveRequestOrigin(context: Context): string | null {
    const forwardedHost = context.req.header('x-forwarded-host')?.trim()
    const forwardedProto = context.req.header('x-forwarded-proto')?.trim()
    if (forwardedHost) {
      return `${forwardedProto || 'https'}://${forwardedHost}`
    }

    const host = context.req.header('host')?.trim()
    if (host) {
      const protocol = host.includes('localhost') ? 'http' : 'https'
      return `${protocol}://${host}`
    }

    try {
      const url = new URL(context.req.url)
      return url.origin
    } catch {
      return null
    }
  }

  private removeExistingSocialMeta(document: StaticAssetDocument): void {
    const metaElements = Array.from(document.head?.querySelectorAll('meta') ?? [])
    for (const meta of metaElements) {
      const name = meta.getAttribute('name')?.toLowerCase()
      const property = meta.getAttribute('property')?.toLowerCase()
      if (name?.startsWith('twitter:') || property?.startsWith('og:')) {
        meta.remove()
      }
    }
  }

  private updateDocumentTitle(document: StaticAssetDocument, title: string): void {
    if (!title) {
      return
    }
    document.title = title
  }

  private insertSocialMetaTags(
    document: StaticAssetDocument,
    data: { title: string; description: string; image: string; url: string },
  ): void {
    const ogTags: Record<string, string> = {
      'og:type': 'website',
      'og:title': data.title,
      'og:description': data.description,
      'og:image': data.image,
      'og:url': data.url,
    }

    const twitterTags: Record<string, string> = {
      'twitter:card': 'summary_large_image',
      'twitter:title': data.title,
      'twitter:description': data.description,
      'twitter:image': data.image,
    }

    this.insertMetaTags(document, ogTags, 'property')
    this.insertMetaTags(document, twitterTags, 'name')
  }

  private insertMetaTags(
    document: StaticAssetDocument,
    tags: Record<string, string>,
    attributeName: 'property' | 'name',
  ): void {
    for (const [key, content] of Object.entries(tags)) {
      const element = document.createElement('meta')
      element.setAttribute(attributeName, key)
      element.setAttribute('content', content)
      document.head?.append(element)
    }
  }

  private injectFaviconLinks(document: StaticAssetDocument): void {
    if (!document.head) {
      return
    }

    const faviconLinks = [
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/static/web/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/static/web/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/static/web/favicon-16x16.png' },
      { rel: 'manifest', href: '/static/web/site.webmanifest' },
      { rel: 'shortcut icon', href: '/static/web/favicon.ico' },
    ]

    for (const linkAttrs of faviconLinks) {
      // Check if link already exists to avoid duplicates
      const existingLink = Array.from(document.head.querySelectorAll('link')).find((link) => {
        const rel = link.getAttribute('rel')
        const href = link.getAttribute('href')
        return rel === linkAttrs.rel && href === linkAttrs.href
      })

      if (!existingLink) {
        const linkElement = document.createElement('link')
        linkElement.setAttribute('rel', linkAttrs.rel)
        linkElement.setAttribute('href', linkAttrs.href)
        if (linkAttrs.sizes) {
          linkElement.setAttribute('sizes', linkAttrs.sizes)
        }
        if (linkAttrs.type) {
          linkElement.setAttribute('type', linkAttrs.type)
        }
        document.head.append(linkElement)
      }
    }
  }

  private createManualHtmlResponse(html: string, baseHeaders: Headers, status: number): Response {
    const headers = new Headers(baseHeaders)
    headers.set('content-length', Buffer.byteLength(html, 'utf8').toString())
    return new Response(html, { status, headers })
  }
}
