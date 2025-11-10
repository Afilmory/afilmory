import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PhotoManifestItem } from '@afilmory/builder'
import { SiteSettingService } from 'core/modules/configuration/site-setting/site-setting.service'
import { ManifestService } from 'core/modules/content/manifest/manifest.service'
import type { Context } from 'hono'
import { DOMParser } from 'linkedom'
import { injectable } from 'tsyringe'

import type { StaticAssetDocument } from './static-asset.service'
import { StaticAssetService } from './static-asset.service'

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
  ) {
    super({
      routeSegment: STATIC_WEB_ROUTE_SEGMENT,
      rootCandidates: STATIC_WEB_ROOT_CANDIDATES,
      assetLinkRels: STATIC_WEB_ASSET_LINK_RELS,
      loggerName: 'StaticWebService',
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
      return this.createHtmlResponse(html, headers, 404)
    }

    const siteConfig = await this.siteSettingService.getSiteConfig()
    const siteTitle = siteConfig.title?.trim() || siteConfig.name || 'Photo Gallery'
    const origin = this.resolveRequestOrigin(context)
    if (!origin) {
      return this.createHtmlResponse(html, headers, response.status)
    }

    try {
      const document = DOM_PARSER.parseFromString(html, 'text/html') as unknown as StaticAssetDocument
      this.removeExistingSocialMeta(document)
      this.updateDocumentTitle(document, `${photo.id} | ${siteTitle}`)
      this.insertOpenGraphTags(document, photo, origin, siteTitle)
      this.insertTwitterTags(document, photo, origin, siteTitle)

      const serialized = document.documentElement.outerHTML
      return this.createHtmlResponse(serialized, headers, 200)
    } catch (error) {
      this.logger.error('Failed to inject Open Graph tags for photo page', { error })
      return this.createHtmlResponse(html, headers, response.status)
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
    const siteConfigPayload = JSON.stringify(siteConfig)
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
    manifestScript.textContent = `window.__MANIFEST__ = ${JSON.stringify(manifest)};`
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

  private insertOpenGraphTags(
    document: StaticAssetDocument,
    photo: PhotoManifestItem,
    origin: string,
    siteTitle: string,
  ): void {
    const tags: Record<string, string> = {
      'og:type': 'website',
      'og:title': `${photo.id} on ${siteTitle}`,
      'og:description': photo.description || '',
      'og:image': `${origin}/og/${photo.id}`,
      'og:url': `${origin}/${photo.id}`,
    }

    for (const [property, content] of Object.entries(tags)) {
      const element = document.createElement('meta')
      element.setAttribute('property', property)
      element.setAttribute('content', content)
      document.head?.append(element)
    }
  }

  private insertTwitterTags(
    document: StaticAssetDocument,
    photo: PhotoManifestItem,
    origin: string,
    siteTitle: string,
  ): void {
    const tags: Record<string, string> = {
      'twitter:card': 'summary_large_image',
      'twitter:title': `${photo.id} on ${siteTitle}`,
      'twitter:description': photo.description || '',
      'twitter:image': `${origin}/og/${photo.id}`,
    }

    for (const [name, content] of Object.entries(tags)) {
      const element = document.createElement('meta')
      element.setAttribute('name', name)
      element.setAttribute('content', content)
      document.head?.append(element)
    }
  }

  private createHtmlResponse(html: string, baseHeaders: Headers, status: number): Response {
    const headers = new Headers(baseHeaders)
    headers.set('content-length', Buffer.byteLength(html, 'utf8').toString())
    return new Response(html, {
      status,
      headers,
    })
  }
}
