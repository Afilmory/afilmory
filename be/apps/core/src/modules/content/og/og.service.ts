import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { PhotoManifestItem } from '@afilmory/builder'
import type { OnModuleDestroy } from '@tsuki/framework'
import type { ExifInfo, HomepageOgTemplateProps, PhotoDimensions } from '@afilmory/og-renderer'
import { renderHomepageOgImage, renderOgImage } from '@afilmory/og-renderer'
import { BizException, ErrorCode } from 'core/errors'
import { SiteSettingService } from 'core/modules/configuration/site-setting/site-setting.service'
import type { Context } from 'hono'
import type { SatoriOptions } from 'satori'
import { injectable } from 'tsyringe'

import { ManifestService } from '../manifest/manifest.service'
import geistFontUrl from './assets/Geist-Medium.ttf?url'
import harmonySansScMediumFontUrl from './assets/HarmonyOS_Sans_SC_Medium.ttf?url'

const CACHE_CONTROL = 'public, max-age=31536000, stale-while-revalidate=31536000'

interface ThumbnailCandidateResult {
  buffer: Buffer
  contentType: string
}

const GeistFontCandidates = [
  resolve(process.cwd(), `./${geistFontUrl}`),
  resolve(process.cwd(), `./dist/${geistFontUrl}`),
]

if (__DEV__) {
  GeistFontCandidates.push(
    resolve(process.cwd(), `./be/apps/core/src/modules/content/og/assets/Geist-Medium.ttf`),
    resolve(process.cwd(), `./apps/core/src/modules/content/og/assets/Geist-Medium.ttf`),
    resolve(process.cwd(), `./core/src/modules/content/og/assets/Geist-Medium.ttf`),
  )
}

const HarmonySansScMediumFontCandidates = [
  resolve(process.cwd(), `./${harmonySansScMediumFontUrl}`),
  resolve(process.cwd(), `./dist/${harmonySansScMediumFontUrl}`),
]

if (__DEV__) {
  HarmonySansScMediumFontCandidates.push(
    resolve(process.cwd(), `./be/apps/core/src/modules/content/og/assets/HarmonyOS_Sans_SC_Medium.ttf`),
    resolve(process.cwd(), `./apps/core/src/modules/content/og/assets/HarmonyOS_Sans_SC_Medium.ttf`),
    resolve(process.cwd(), `./core/src/modules/content/og/assets/HarmonyOS_Sans_SC_Medium.ttf`),
  )
}
@injectable()
export class OgService implements OnModuleDestroy {
  private fontConfig: SatoriOptions['fonts'] | null = null
  private fontCleanupTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly manifestService: ManifestService,
    private readonly siteSettingService: SiteSettingService,
  ) {}

  onModuleDestroy(): void {
    if (this.fontCleanupTimer) {
      clearTimeout(this.fontCleanupTimer)
      this.fontCleanupTimer = null
    }
  }

  async render(context: Context, photoId: string): Promise<Response> {
    const manifest = await this.manifestService.getManifest()
    const photo = manifest.data.find((entry) => entry.id === photoId)
    if (!photo) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: 'Photo not found' })
    }

    const siteConfig = await this.siteSettingService.getSiteConfig()
    const formattedDate = this.formatDate(photo.exif?.DateTimeOriginal ?? photo.lastModified)
    const exifInfo = this.buildExifInfo(photo)
    const photoDimensions = this.getPhotoDimensions(photo)
    const tags = (photo.tags ?? []).slice(0, 3)
    const thumbnailSrc = await this.resolveThumbnailSrc(context, photo)

    const png = await renderOgImage({
      template: {
        photoTitle: photo.title || photo.id || 'Untitled Photo',
        siteName: siteConfig.name || siteConfig.title || 'Photo Gallery',
        tags,
        formattedDate,
        exifInfo,
        thumbnailSrc,
        photoDimensions,
        accentColor: siteConfig.accentColor,
      },
      fonts: await this.getFontConfig(),
    })
    const headers = new Headers({
      'content-type': 'image/png',
      'cache-control': CACHE_CONTROL,
      'cloudflare-cdn-cache-control': CACHE_CONTROL,
    })

    const body = this.toArrayBuffer(png)

    return new Response(body, { status: 200, headers })
  }

  async renderHomepage(context: Context): Promise<Response> {
    const manifest = await this.manifestService.getManifest()
    const siteConfig = await this.siteSettingService.getSiteConfig()

    // Calculate statistics
    const totalPhotos = manifest.data.length
    const uniqueTags = new Set<string>()
    manifest.data.forEach((photo) => {
      photo.tags?.forEach((tag) => uniqueTags.add(tag))
    })
    const uniqueCameras = manifest.cameras.length

    // Resolve author avatar if available
    let authorAvatar: string | null = null
    if (siteConfig.author?.avatar) {
      // Try to fetch and convert to data URL
      const avatarUrl = await this.resolveAuthorAvatar(context, siteConfig.author.avatar)
      if (avatarUrl) {
        authorAvatar = avatarUrl
      }
    }

    // Get featured photos (latest 6 photos) for background
    const featuredPhotos = await Promise.all(
      manifest.data.slice(0, 6).map(async (photo) => {
        const thumbnailSrc = await this.resolveThumbnailSrc(context, photo)
        return { thumbnailSrc }
      }),
    )

    const templateProps: HomepageOgTemplateProps = {
      siteName: siteConfig.name || siteConfig.title || 'Photo Gallery',
      siteDescription: siteConfig.description || null,
      authorAvatar,
      accentColor: siteConfig.accentColor,
      stats: {
        totalPhotos,
        uniqueTags: uniqueTags.size,
        uniqueCameras,
        totalSizeGB: null, // Can be added later if needed
      },
      featuredPhotos: featuredPhotos.length > 0 ? featuredPhotos : null,
    }

    const png = await renderHomepageOgImage({
      template: templateProps,
      fonts: await this.getFontConfig(),
    })

    const headers = new Headers({
      'content-type': 'image/png',
      'cache-control': CACHE_CONTROL,
      'cloudflare-cdn-cache-control': CACHE_CONTROL,
    })

    const body = this.toArrayBuffer(png)

    return new Response(body, { status: 200, headers })
  }

  private async resolveAuthorAvatar(context: Context, avatarUrl: string): Promise<string | null> {
    // If it's already a data URL, return as is
    if (avatarUrl.startsWith('data:')) {
      return avatarUrl
    }

    // Try to fetch and convert to data URL
    try {
      const fetched = await this.tryFetchUrl(avatarUrl)
      if (fetched) {
        return this.bufferToDataUrl(fetched.buffer, fetched.contentType)
      }

      // If direct fetch failed, try with context base URL
      const base = this.resolveBaseUrl(context)
      if (base && !avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
        const normalizedPath = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`
        const fullUrl = new URL(normalizedPath, base).toString()
        const fetched2 = await this.tryFetchUrl(fullUrl)
        if (fetched2) {
          return this.bufferToDataUrl(fetched2.buffer, fetched2.contentType)
        }
      }

      // If all fails, return the original URL (satori might be able to handle it)
      return avatarUrl
    } catch {
      return avatarUrl
    }
  }

  private geistFontPromise: Promise<NonSharedBuffer> | null = null
  private harmonySansScMediumFontPromise: Promise<NonSharedBuffer> | null = null
  async loadFonts() {
    if (!this.geistFontPromise) {
      for (const candidate of GeistFontCandidates) {
        const stats = await stat(candidate).catch(() => null)
        if (!stats) {
          continue
        }
        if (stats.isFile()) {
          this.geistFontPromise = readFile(candidate)
          break
        }
      }
    }
    if (!this.harmonySansScMediumFontPromise) {
      for (const candidate of HarmonySansScMediumFontCandidates) {
        const stats = await stat(candidate).catch(() => null)
        if (!stats) {
          continue
        }
        if (stats.isFile()) {
          this.harmonySansScMediumFontPromise = readFile(candidate)
          break
        }
      }
    }
    this.resetFontCleanupTimer()
  }

  private async getFontConfig(): Promise<SatoriOptions['fonts']> {
    await this.loadFonts()

    return [
      {
        name: 'Geist',
        data: await this.geistFontPromise!,
        style: 'normal',
        weight: 400,
      },
      {
        name: 'HarmonyOS Sans SC',
        data: await this.harmonySansScMediumFontPromise!,
        style: 'normal',
        weight: 400,
      },
    ]
  }

  private resetFontCleanupTimer(): void {
    if (this.fontCleanupTimer) {
      clearTimeout(this.fontCleanupTimer)
    }
    // Clean font promises 10 minutes after last activity
    this.fontCleanupTimer = setTimeout(
      () => {
        this.geistFontPromise = null
        this.harmonySansScMediumFontPromise = null
        this.fontConfig = null
        this.fontCleanupTimer = null
      },
      10 * 60 * 1000,
    )
  }

  private toArrayBuffer(source: ArrayBufferView): ArrayBuffer {
    const { buffer, byteOffset, byteLength } = source

    if (buffer instanceof ArrayBuffer) {
      return buffer.slice(byteOffset, byteOffset + byteLength)
    }

    const copy = new ArrayBuffer(byteLength)
    const view = new Uint8Array(buffer, byteOffset, byteLength)
    new Uint8Array(copy).set(view)

    return copy
  }

  private formatDate(input?: string | null): string | undefined {
    if (!input) {
      return undefined
    }

    const timestamp = Date.parse(input)
    if (Number.isNaN(timestamp)) {
      return undefined
    }

    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  private buildExifInfo(photo: PhotoManifestItem): ExifInfo | null {
    const { exif } = photo
    if (!exif) {
      return null
    }

    const focalLength = exif.FocalLengthIn35mmFormat || exif.FocalLength
    const aperture = exif.FNumber ? `f/${exif.FNumber}` : null
    const iso = exif.ISO ?? null
    const shutterSpeed = exif.ExposureTime ? `${exif.ExposureTime}s` : null
    const camera =
      exif.Make && exif.Model ? `${exif.Make.trim()} ${exif.Model.trim()}`.trim() : (exif.Model ?? exif.Make ?? null)

    if (!focalLength && !aperture && !iso && !shutterSpeed && !camera) {
      return null
    }

    return {
      focalLength: focalLength ?? null,
      aperture,
      iso,
      shutterSpeed,
      camera,
    }
  }

  private getPhotoDimensions(photo: PhotoManifestItem): PhotoDimensions {
    return {
      width: photo.width || 1,
      height: photo.height || 1,
    }
  }

  private async resolveThumbnailSrc(context: Context, photo: PhotoManifestItem): Promise<string | null> {
    const normalized = this.normalizeThumbnailPath(photo.thumbnailUrl)
    if (!normalized) {
      return null
    }

    const fetched = await this.fetchThumbnailBuffer(context, normalized)
    if (!fetched) {
      return null
    }

    return this.bufferToDataUrl(fetched.buffer, fetched.contentType)
  }

  private normalizeThumbnailPath(value?: string | null): string | null {
    if (!value) {
      return null
    }

    const replaced = value.replace(/\.webp$/i, '.jpg')
    return replaced
  }

  private async fetchThumbnailBuffer(
    context: Context,
    thumbnailPath: string,
  ): Promise<ThumbnailCandidateResult | null> {
    const requests = this.buildThumbnailUrlCandidates(context, thumbnailPath)
    for (const candidate of requests) {
      const fetched = await this.tryFetchUrl(candidate)
      if (fetched) {
        return fetched
      }
    }

    return null
  }

  private async tryFetchUrl(url: string): Promise<ThumbnailCandidateResult | null> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return null
      }
      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') ?? 'image/jpeg'
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      }
    } catch {
      return null
    }
  }

  private buildThumbnailUrlCandidates(context: Context, thumbnailPath: string): string[] {
    const result: string[] = []
    const externalOverride = process.env.OG_THUMBNAIL_ORIGIN?.trim()
    const normalizedPath = thumbnailPath.startsWith('/') ? thumbnailPath : `/${thumbnailPath}`

    if (thumbnailPath.startsWith('http://') || thumbnailPath.startsWith('https://')) {
      result.push(thumbnailPath)
    } else {
      const base = this.resolveBaseUrl(context)
      if (base) {
        result.push(new URL(normalizedPath, base).toString())
        if (!normalizedPath.startsWith('/static/web/')) {
          result.push(new URL(`/static/web${normalizedPath}`, base).toString())
        }
      }

      if (externalOverride) {
        result.push(`${externalOverride.replace(/\/+$/, '')}${normalizedPath}`)
      }
    }

    return Array.from(new Set(result))
  }

  private resolveBaseUrl(context: Context): URL | null {
    const forwardedHost = context.req.header('x-forwarded-host')
    const forwardedProto = context.req.header('x-forwarded-proto')
    const host = forwardedHost ?? context.req.header('host')

    if (host) {
      const protocol = forwardedProto ?? (host.includes('localhost') ? 'http' : 'https')
      try {
        return new URL(`${protocol}://${host}`)
      } catch {
        return null
      }
    }

    try {
      return new URL(context.req.url)
    } catch {
      return null
    }
  }

  private bufferToDataUrl(buffer: Buffer, contentType: string): string {
    return `data:${contentType};base64,${buffer.toString('base64')}`
  }
}
