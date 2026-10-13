import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ExifInfo } from '@afilmory/og-renderer'
import { OG_IMAGE_FILE_EXTENSION, OG_IMAGE_MIME_TYPE, renderOgImage } from '@afilmory/og-renderer'
import type { PhotoManifestItem } from '@afilmory/typing'
import type { SatoriOptions } from 'satori'

import type { Logger } from '../../logger/index.js'
import { workdir } from '../../path.js'
import { StorageManager } from '../../storage/index.js'
import type { S3CompatibleConfig, StorageConfig } from '../../storage/interfaces.js'
import type { ThumbnailPluginData } from '../thumbnail-storage/shared.js'
import { THUMBNAIL_PLUGIN_DATA_KEY } from '../thumbnail-storage/shared.js'
import type { BuilderPlugin } from '../types.js'
import type { CloudflareMiddlewareVendorConfig } from './vendors/cloudflare-moddleware.js'
import { CloudflareMiddlewareVendor } from './vendors/cloudflare-moddleware.js'
import type { OgVendor } from './vendors/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../../../..')
const ogAssetsDir = path.join(repoRoot, 'be/apps/core/src/modules/content/og/assets')

const PLUGIN_NAME = 'afilmory:og-image'
const RUN_STATE_KEY = 'state'
const DEFAULT_DIRECTORY = '.afilmory/og-images'
const DEFAULT_CONTENT_TYPE = OG_IMAGE_MIME_TYPE
const DEFAULT_SITE_NAME = 'Photo Gallery'
const DEFAULT_ACCENT_COLOR = '#007bff'

type UploadableStorageConfig = Exclude<StorageConfig, { provider: 'eagle' }>

interface OgImagePluginOptions {
  enable?: boolean
  directory?: string
  storageConfig?: UploadableStorageConfig
  contentType?: string
  siteName?: string
  accentColor?: string
  siteConfigPath?: string
  vendor?: OgVendorConfig
}

type OgVendorConfig = CloudflareMiddlewareVendorConfig

interface ResolvedPluginConfig {
  directory: string
  remotePrefix: string
  contentType: string
  useDefaultStorage: boolean
  storageConfig: UploadableStorageConfig | null
  enabled: boolean
}

interface SiteMeta {
  siteName: string
  accentColor?: string
}

interface PluginRunState {
  uploaded: Set<string>
  urlCache: Map<string, string>
  fonts?: SatoriOptions['fonts'] | null
  siteMeta?: SiteMeta
  /**
   * Ids whose card in the existing manifest was written by a previous format.
   * Those photos are re-rendered instead of reusing a key that was never
   * written. Tracked per photo so a partially migrated library converges
   * without re-rendering the cards that are already current.
   */
  legacyFormatPhotoIds?: Set<string>
}

function normalizeDirectory(directory: string | undefined): string {
  const value = directory?.trim() || DEFAULT_DIRECTORY
  const normalized = value.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
  return normalized || DEFAULT_DIRECTORY
}

/**
 * Decide whether an `ogImageUrl` recorded in an existing manifest was produced
 * by a different (older) rendering format.
 *
 * Comparing extensions rather than hardcoding "png" keeps this working for any
 * future format change: whatever the current extension is, anything else is
 * stale. Photos whose cards predate the current format must be re-rendered,
 * because the skipped path would otherwise hand out a URL for a key that was
 * never uploaded.
 */
function isLegacyOgImageUrl(ogImageUrl: string | null | undefined, currentExtension: string): boolean {
  if (!ogImageUrl) {
    return false
  }

  const pathname = ogImageUrl.split(/[?#]/, 1)[0] ?? ''
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  const dotIndex = lastSegment.lastIndexOf('.')

  // No extension at all: nothing to compare, treat as current to avoid
  // re-rendering the whole library on the first run after an upgrade.
  if (dotIndex <= 0) {
    return false
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase() !== currentExtension.toLowerCase()
}

function trimSlashes(value: string | undefined | null): string | null {
  if (!value) return null
  const normalized = value.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : null
}

function joinSegments(...segments: Array<string | null | undefined>): string {
  const filtered = segments
    .map((segment) => (segment ?? '').replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
  return filtered.join('/')
}

function resolveSiteConfigPath(siteConfigPath: string | undefined): string {
  if (!siteConfigPath) return path.resolve(repoRoot, 'config.json')
  return path.isAbsolute(siteConfigPath) ? siteConfigPath : path.resolve(repoRoot, siteConfigPath)
}

function resolveRemotePrefix(config: UploadableStorageConfig, directory: string): string {
  switch (config.provider) {
    case 's3':
    case 'oss':
    case 'cos': {
      const base = trimSlashes((config as S3CompatibleConfig).prefix)
      return joinSegments(base, directory)
    }
    default: {
      return joinSegments(directory)
    }
  }
}

/**
 * Get or initialize per-run caches to dedupe uploads and URL lookups.
 */
function getOrCreateRunState(container: Map<string, unknown>): PluginRunState {
  let state = container.get(RUN_STATE_KEY) as PluginRunState | undefined
  if (!state) {
    state = {
      uploaded: new Set<string>(),
      urlCache: new Map<string, string>(),
      fonts: null,
    }
    container.set(RUN_STATE_KEY, state)
  }
  return state
}

async function loadFontFile(fileName: string): Promise<Buffer | null> {
  const candidates = [
    path.join(ogAssetsDir, fileName),
    path.join(repoRoot, 'apps/core/src/modules/content/og/assets', fileName),
    path.join(repoRoot, 'core/src/modules/content/og/assets', fileName),
  ]

  for (const candidate of candidates) {
    const stats = await stat(candidate).catch(() => null)
    if (stats?.isFile()) {
      return await readFile(candidate)
    }
  }

  return null
}

/**
 * Load required fonts for Satori/resvg. Missing fonts cause the plugin to skip rendering.
 */
async function loadFonts(logger: Logger): Promise<SatoriOptions['fonts'] | null> {
  const geist = await loadFontFile('Geist-Medium.ttf')
  const harmony = await loadFontFile('HarmonyOS_Sans_SC_Medium.ttf')

  if (!geist || !harmony) {
    logger.main.warn('OG image plugin: fonts not found, skip rendering for this run.')
    return null
  }

  return [
    {
      name: 'Geist',
      data: geist,
      style: 'normal',
      weight: 400,
    },
    {
      name: 'HarmonyOS Sans SC',
      data: harmony,
      style: 'normal',
      weight: 400,
    },
  ]
}

/**
 * Resolve site branding from a JSON config file, with sane fallbacks when the file is absent.
 */
async function loadSiteMeta(options: OgImagePluginOptions, logger: Logger): Promise<SiteMeta> {
  const fallback: SiteMeta = {
    siteName: options.siteName?.trim() || DEFAULT_SITE_NAME,
    accentColor: options.accentColor?.trim() || DEFAULT_ACCENT_COLOR,
  }

  const siteConfigPath = resolveSiteConfigPath(options.siteConfigPath)

  try {
    const raw = await readFile(siteConfigPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<{ name: string; title: string; accentColor: string }>

    return {
      siteName: parsed.name?.trim() || parsed.title?.trim() || fallback.siteName,
      accentColor: parsed.accentColor?.trim() || fallback.accentColor,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.main.info(`OG image plugin: using fallback site meta (${siteConfigPath} not readable: ${message}).`)
    return fallback
  }
}

function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  const base64 = buffer.toString('base64')
  return `data:${contentType};base64,${base64}`
}

function guessContentType(thumbnailUrl: string): string {
  const lowered = thumbnailUrl.toLowerCase()
  if (lowered.endsWith('.png')) return 'image/png'
  if (lowered.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function resolveThumbnailDataUrl(
  item: PhotoManifestItem,
  pluginData: ThumbnailPluginData | undefined,
  logger: Logger,
): Promise<string | null> {
  // Prefer the in-memory thumbnail to avoid extra reads; fall back to URLs when needed.
  if (pluginData?.buffer) {
    return bufferToDataUrl(pluginData.buffer, 'image/jpeg')
  }

  const thumbnailUrl = pluginData?.localUrl || item.thumbnailUrl
  if (!thumbnailUrl) return null

  const contentType = guessContentType(thumbnailUrl)

  if (/^https?:\/\//i.test(thumbnailUrl)) {
    try {
      const response = await fetch(thumbnailUrl)
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return bufferToDataUrl(Buffer.from(arrayBuffer), response.headers.get('content-type') ?? contentType)
      }
    } catch (error) {
      logger.thumbnail?.warn?.(`OG image plugin: failed to fetch remote thumbnail ${thumbnailUrl}`, error)
    }
  }

  const normalized = thumbnailUrl.replace(/^\/+/, '')
  const localPath = path.join(workdir, 'public', normalized)

  try {
    const localBuffer = await readFile(localPath)
    return bufferToDataUrl(localBuffer, contentType)
  } catch (error) {
    logger.thumbnail?.debug?.(`OG image plugin: could not read local thumbnail ${localPath}`, error)
    return null
  }
}

function formatDate(input?: string | null): string | undefined {
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

/**
 * Build a lightweight EXIF summary for display; returns null when nothing meaningful is present.
 */
function buildExifInfo(photo: PhotoManifestItem): ExifInfo | null {
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

function getPhotoDimensions(photo: PhotoManifestItem) {
  return {
    width: photo.width || 1,
    height: photo.height || 1,
  }
}

function createVendor(config: OgVendorConfig): OgVendor {
  switch (config.type) {
    case 'cloudflare-middleware': {
      return new CloudflareMiddlewareVendor(config)
    }
    default: {
      throw new Error(`Unknown OG vendor type: ${String((config as { type?: string }).type)}`)
    }
  }
}

/**
 * Render Open Graph images for processed photos and upload them to remote storage.
 *
 * The plugin reuses generated thumbnails as the image source, injects light EXIF
 * metadata, and caches uploads/URLs during a single builder run to reduce storage
 * churn.
 */
export default function ogImagePlugin(options: OgImagePluginOptions = {}): BuilderPlugin {
  let resolved: ResolvedPluginConfig | null = null
  let externalStorageManager: StorageManager | null = null
  let vendor: OgVendor | null = null

  return {
    name: PLUGIN_NAME,
    hooks: {
      onInit: ({ builder, config, logger }) => {
        const enable = options.enable ?? true
        const directory = normalizeDirectory(options.directory)
        const contentType = options.contentType ?? DEFAULT_CONTENT_TYPE

        if (options.vendor && !vendor) {
          try {
            vendor = createVendor(options.vendor)
          } catch (error) {
            logger.main.error('OG image plugin: failed to initialize vendor config.', error)
            throw error
          }
        }

        if (!enable) {
          resolved = {
            directory,
            remotePrefix: '',
            contentType,
            useDefaultStorage: true,
            storageConfig: null,
            enabled: false,
          }
          return
        }

        const fallbackStorage = config.user?.storage ?? builder.getStorageConfig()
        const storageConfig = (options.storageConfig ?? fallbackStorage) as StorageConfig

        if (storageConfig.provider === 'eagle') {
          logger.main.warn('OG image plugin does not support Eagle storage provider; plugin disabled.')
          resolved = {
            directory,
            remotePrefix: '',
            contentType,
            useDefaultStorage: !options.storageConfig,
            storageConfig: null,
            enabled: false,
          }
          return
        }

        const uploadableConfig = storageConfig as UploadableStorageConfig
        const remotePrefix = resolveRemotePrefix(uploadableConfig, directory)

        resolved = {
          directory,
          remotePrefix,
          contentType,
          useDefaultStorage: !options.storageConfig,
          storageConfig: uploadableConfig,
          enabled: true,
        }

        if (!options.storageConfig) {
          builder.getStorageManager().addExcludePrefix(remotePrefix)
        } else {
          externalStorageManager = new StorageManager(uploadableConfig)
        }
      },
      /**
       * Detect a format migration before any photo work begins.
       *
       * The existing manifest records the `ogImageUrl` of every card from the
       * previous run. Photos whose card points at a different extension than the
       * one this build writes must be re-rendered, because the skipped path only
       * derives a URL and would otherwise hand out a key that was never uploaded.
       */
      afterManifestLoad: ({ payload, runShared, logger }) => {
        if (!resolved || !resolved.enabled) {
          return
        }

        const state = getOrCreateRunState(runShared)
        const staleIds = new Set<string>()

        for (const entry of payload.manifest.data ?? []) {
          if (entry.id && isLegacyOgImageUrl(entry.ogImageUrl, OG_IMAGE_FILE_EXTENSION)) {
            staleIds.add(entry.id)
          }
        }

        state.legacyFormatPhotoIds = staleIds

        if (staleIds.size > 0) {
          logger.main.info(
            `OG image plugin: ${staleIds.size} existing card(s) use a previous format; they will be re-rendered as .${OG_IMAGE_FILE_EXTENSION}.`,
          )
        }
      },
      afterPhotoProcess: async ({ builder, payload, runShared, logger }) => {
        if (!resolved || !resolved.enabled) {
          return
        }

        const { item, type } = payload.result
        if (!item) {
          return
        }

        const storageManager = resolved.useDefaultStorage ? builder.getStorageManager() : externalStorageManager
        if (!storageManager) {
          logger.main.warn('OG image plugin could not resolve storage manager. Skipping upload.')
          return
        }

        const state = getOrCreateRunState(runShared)

        if (!state.siteMeta) {
          state.siteMeta = await loadSiteMeta(options, logger)
        }

        if (!state.fonts) {
          state.fonts = await loadFonts(logger)
        }

        const { fonts } = state
        if (!fonts) {
          return
        }

        const staleLegacyCard = state.legacyFormatPhotoIds?.has(item.id) === true

        const shouldRender
          = type !== 'skipped'
            || payload.options.isForceMode
            || payload.options.isForceManifest
            || staleLegacyCard

        const remoteKey = joinSegments(resolved.remotePrefix, `${item.id}.${OG_IMAGE_FILE_EXTENSION}`)

        if (!shouldRender) {
          try {
            const remoteUrl = await storageManager.generatePublicUrl(remoteKey)
            state.urlCache.set(remoteKey, remoteUrl)
            item.ogImageUrl = remoteUrl
          } catch (error) {
            logger.main.info(`OG image plugin: skipped rendering and could not resolve URL for ${remoteKey}.`, error)
          }
          return
        }

        const thumbnailData = payload.context.pluginData[THUMBNAIL_PLUGIN_DATA_KEY] as ThumbnailPluginData | undefined
        const thumbnailSrc = await resolveThumbnailDataUrl(item, thumbnailData, logger)
        const exifInfo = buildExifInfo(item)
        const formattedDate = formatDate(item.exif?.DateTimeOriginal ?? item.lastModified)

        try {
          const image = await renderOgImage({
            template: {
              photoTitle: item.title || item.id || 'Untitled Photo',
              siteName: state.siteMeta.siteName || DEFAULT_SITE_NAME,
              tags: (item.tags ?? []).slice(0, 3),
              formattedDate,
              exifInfo,
              thumbnailSrc,
              photoDimensions: getPhotoDimensions(item),
              accentColor: state.siteMeta.accentColor ?? DEFAULT_ACCENT_COLOR,
            },
            fonts,
          })

          const stateForUpload = state
          if (
            !stateForUpload.uploaded.has(remoteKey) ||
            payload.options.isForceMode ||
            payload.options.isForceManifest
          ) {
            try {
              await storageManager.uploadFile(remoteKey, Buffer.from(image), {
                contentType: resolved.contentType,
              })
              stateForUpload.uploaded.add(remoteKey)
            } catch (error) {
              logger.main.error(`OG image plugin: failed to upload ${remoteKey}`, error)
              return
            }
          }

          let remoteUrl = stateForUpload.urlCache.get(remoteKey)
          if (!remoteUrl) {
            try {
              remoteUrl = await storageManager.generatePublicUrl(remoteKey)
              stateForUpload.urlCache.set(remoteKey, remoteUrl)
            } catch (error) {
              logger.main.error(`OG image plugin: failed to generate URL for ${remoteKey}`, error)
              return
            }
          }

          item.ogImageUrl = remoteUrl
        } catch (error) {
          logger.main.error(`OG image plugin: failed to render OG image for ${item.id}`, error)
        }
      },
      afterBuild: async ({ logger }) => {
        if (!vendor) return

        try {
          await vendor.build({ repoRoot, logger })
        } catch (error) {
          logger.main.error('OG image plugin: vendor build step failed.', error)
        }
      },
    },
  }
}

export type { OgImagePluginOptions, OgVendorConfig }

export { type CloudflareMiddlewareVendorConfig } from './vendors/cloudflare-moddleware.js'
export { type OgVendorKind } from './vendors/types.js'
