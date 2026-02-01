import type { PhotoManifestItem } from '@afilmory/typing'

const GENERATOR_NAME = 'Afilmory Feed Generator'
const EXIF_NAMESPACE = 'https://afilmory.art/rss/exif'
const PROTOCOL_VERSION = '1.1'
const PROTOCOL_ID = 'afilmory-rss-exif'

export interface FeedSiteAuthor {
  name: string
  url?: string | null
  avatar?: string | null
}

export interface FeedSiteConfig {
  title: string
  description?: string | null
  url: string
  author?: FeedSiteAuthor
  locale?: string | null
}

export function generateRSSFeed(photos: readonly PhotoManifestItem[], config: FeedSiteConfig): string {
  const baseUrl = normalizeBaseUrl(config.url)
  const sortedPhotos = [...photos].sort((a, b) => resolveDate(b) - resolveDate(a))
  const lastBuildDate = new Date().toUTCString()
  const channelDescription = escapeXml(config.description ?? config.title ?? 'Photo feed')
  const channelLanguage = escapeXml(config.locale ?? 'en')

  const itemsXml = sortedPhotos.map((photo) => createItemXml(photo, baseUrl)).join('\n')

  const author = config.author?.name ? escapeXml(config.author.name) : null
  const managingEditor = author && config.author?.url ? `${author} (${config.author.url})` : author

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:exif="${EXIF_NAMESPACE}">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${baseUrl}</link>
    <description>${channelDescription}</description>
    <language>${channelLanguage}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>${GENERATOR_NAME}</generator>
    ${managingEditor ? `<managingEditor>${managingEditor}</managingEditor>` : ''}
    <exif:version>${PROTOCOL_VERSION}</exif:version>
    <exif:protocol>${PROTOCOL_ID}</exif:protocol>
${itemsXml}
  </channel>
</rss>`
}

function createItemXml(photo: PhotoManifestItem, baseUrl: string): string {
  const link = `${baseUrl}/photos/${encodeURIComponent(photo.id)}`
  const pubDate = new Date(resolveDate(photo)).toUTCString()
  const title = escapeXml(photo.title ?? photo.id)
  const summary = buildDescription(photo)
  const categories =
    Array.isArray(photo.tags) && photo.tags.length > 0
      ? photo.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n')
      : ''

  // Add enclosure for thumbnail if available
  // Assuming thumbnail is an image, default to image/jpeg if extension is unknown, but usually it's webp or jpg
  let enclosure = ''
  if (photo.thumbnailUrl) {
    const thumbUrl = photo.thumbnailUrl.startsWith('http')
      ? photo.thumbnailUrl
      : `${baseUrl}${photo.thumbnailUrl.startsWith('/') ? '' : '/'}${photo.thumbnailUrl}`
    // Simple mime type guess
    const mimeType = thumbUrl.endsWith('.webp') ? 'image/webp' : thumbUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
    enclosure = `      <enclosure url="${escapeXml(thumbUrl)}" type="${mimeType}" length="0" />`
  }

  const exifTags = buildExifTags(photo)

  return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${escapeXml(photo.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${summary}]]></description>
${categories}
${enclosure}
${exifTags}
    </item>`
}

function buildExifTags(photo: PhotoManifestItem): string {
  if (!photo.exif) return ''

  const tags: string[] = []
  const { exif } = photo

  // --- Basic Camera Settings ---
  if (exif.FNumber) {
    tags.push(`<exif:aperture>f/${exif.FNumber}</exif:aperture>`)
  }
  if (exif.ExposureTime) {
    // Format shutter speed: if < 1, use fraction, else use seconds
    let ss = String(exif.ExposureTime)
    if (typeof exif.ExposureTime === 'number') {
      if (exif.ExposureTime < 1 && exif.ExposureTime > 0) {
        ss = `1/${Math.round(1 / exif.ExposureTime)}s`
      } else {
        ss = `${exif.ExposureTime}s`
      }
    } else if (
      !ss.endsWith('s') && // If it's a string and doesn't end with s, append it?
      // Actually exiftool usually gives nice strings or numbers.
      // Let's just trust the value but ensure 's' suffix if it looks like a number
      !Number.isNaN(Number(ss))
    ) {
      ss = `${ss}s`
    }
    tags.push(`<exif:shutterSpeed>${ss}</exif:shutterSpeed>`)
  }
  if (exif.ISO) {
    tags.push(`<exif:iso>${exif.ISO}</exif:iso>`)
  }
  if (exif.ExposureCompensation !== undefined && exif.ExposureCompensation !== null) {
    const val = Number(exif.ExposureCompensation)
    const sign = val > 0 ? '+' : ''
    tags.push(`<exif:exposureCompensation>${sign}${val} EV</exif:exposureCompensation>`)
  }

  // --- Lens Parameters ---
  if (exif.FocalLength) {
    // Ensure 'mm' suffix
    const fl = String(exif.FocalLength).replace('mm', '').trim()
    tags.push(`<exif:focalLength>${fl}mm</exif:focalLength>`)
  }
  if (exif.FocalLengthIn35mmFormat) {
    const fl35 = String(exif.FocalLengthIn35mmFormat).replace('mm', '').trim()
    tags.push(`<exif:focalLength35mm>${fl35}mm</exif:focalLength35mm>`)
  }
  if (exif.LensModel) {
    tags.push(`<exif:lens><![CDATA[${exif.LensModel}]]></exif:lens>`)
  }
  if (exif.MaxApertureValue) {
    tags.push(`<exif:maxAperture>f/${exif.MaxApertureValue}</exif:maxAperture>`)
  }

  // --- Device Info ---
  const camera = [exif.Make, exif.Model].filter(Boolean).join(' ')
  if (camera) {
    tags.push(`<exif:camera><![CDATA[${camera}]]></exif:camera>`)
  }

  // --- Image Attributes ---
  if (photo.width) {
    tags.push(`<exif:imageWidth>${photo.width}</exif:imageWidth>`)
  }
  if (photo.height) {
    tags.push(`<exif:imageHeight>${photo.height}</exif:imageHeight>`)
  }
  if (photo.dateTaken) {
    tags.push(`<exif:dateTaken>${photo.dateTaken}</exif:dateTaken>`)
  }
  if (exif.Orientation) {
    tags.push(`<exif:orientation>${exif.Orientation}</exif:orientation>`)
  }

  // --- Location Info ---
  // Location info removed as per user request

  // Location name is not directly in standard exif usually, but if we had it in photo info...
  // Currently PhotoManifestItem doesn't seem to have a dedicated location name field other than maybe tags or description.
  // We'll skip <exif:location> for now unless we find a source.

  // --- Technical Parameters ---
  if (exif.WhiteBalance) {
    tags.push(`<exif:whiteBalance>${exif.WhiteBalance}</exif:whiteBalance>`)
  }
  if (exif.MeteringMode) {
    tags.push(`<exif:meteringMode>${exif.MeteringMode}</exif:meteringMode>`)
  }
  // Flash is often a complex object or string in exiftool, simplify if possible or just dump string
  if (exif.Flash) {
    // Try to map to simple enum if possible, or just use what we have if it's readable
    tags.push(`<exif:flashMode>${String(exif.Flash)}</exif:flashMode>`)
  }
  if (exif.ColorSpace) {
    tags.push(`<exif:colorSpace>${exif.ColorSpace}</exif:colorSpace>`)
  }

  // --- Advanced Parameters ---
  if (exif.ExposureProgram) {
    tags.push(`<exif:exposureProgram>${exif.ExposureProgram}</exif:exposureProgram>`)
  }
  if (exif.SceneCaptureType) {
    tags.push(`<exif:sceneMode><![CDATA[${exif.SceneCaptureType}]]></exif:sceneMode>`)
  }

  // Try to extract from FujiRecipe if available
  if (exif.FujiRecipe) {
    if (exif.FujiRecipe.Sharpness) {
      tags.push(`<exif:sharpness>${exif.FujiRecipe.Sharpness}</exif:sharpness>`)
    }
    if (exif.FujiRecipe.Saturation) {
      tags.push(`<exif:saturation>${exif.FujiRecipe.Saturation}</exif:saturation>`)
    }
    // Contrast is often "HighlightTone" and "ShadowTone" combined in Fuji,
    // or maybe just map one of them? The spec asks for Contrast.
    // Let's skip Contrast for FujiRecipe to avoid confusion unless we have a direct mapping.
  }

  return tags.map((t) => `      ${t}`).join('\n')
}

function buildDescription(photo: PhotoManifestItem): string {
  const segments: string[] = []
  if (photo.description) {
    segments.push(escapeHtmlBlock(photo.description))
  }
  if (Array.isArray(photo.tags) && photo.tags.length > 0) {
    segments.push(`<p><strong>Tags:</strong> ${photo.tags.map(escapeXml).join(', ')}</p>`)
  }

  if (photo.exif) {
    const exifParts: string[] = []
    if (photo.exif.Model) {
      exifParts.push(escapeXml(photo.exif.Model))
    }
    if (photo.exif.LensModel) {
      exifParts.push(escapeXml(photo.exif.LensModel))
    }
    if (photo.exif.FNumber) {
      exifParts.push(`f/${photo.exif.FNumber}`)
    }
    if (photo.exif.ExposureTime) {
      exifParts.push(`${photo.exif.ExposureTime}s`)
    }
    if (exifParts.length > 0) {
      segments.push(`<p><strong>EXIF:</strong> ${exifParts.join(' · ')}</p>`)
    }
  }

  return segments.join('\n') || escapeXml(photo.title ?? photo.id)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlBlock(value: string): string {
  return `<p>${escapeXml(value)}</p>`
}

function normalizeBaseUrl(url: string): string {
  if (!url) {
    return 'https://example.com'
  }
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function resolveDate(photo: PhotoManifestItem): number {
  const date = photo.dateTaken ?? photo.lastModified
  const timestamp = date ? Date.parse(date) : Number.NaN
  if (!Number.isNaN(timestamp)) {
    return timestamp
  }
  return Date.now()
}
