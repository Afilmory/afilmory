import type { PhotoManifestItem } from '@afilmory/builder'

const GENERATOR_NAME = 'Afilmory Feed Generator'

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
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${baseUrl}</link>
    <description>${channelDescription}</description>
    <language>${channelLanguage}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>${GENERATOR_NAME}</generator>
    ${managingEditor ? `<managingEditor>${managingEditor}</managingEditor>` : ''}
${itemsXml}
  </channel>
</rss>`
}

function createItemXml(photo: PhotoManifestItem, baseUrl: string): string {
  const link = `${baseUrl}/${encodeURIComponent(photo.id)}`
  const pubDate = new Date(resolveDate(photo)).toUTCString()
  const title = escapeXml(photo.title ?? photo.id)
  const summary = buildDescription(photo)
  const categories =
    Array.isArray(photo.tags) && photo.tags.length > 0
      ? photo.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n')
      : ''

  return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${escapeXml(photo.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${summary}]]></description>
${categories}
    </item>`
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
