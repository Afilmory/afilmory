import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'

export interface FeedSiteAuthor {
  name: string
  url: string
  avatar?: string | null
}

export interface FeedSiteConfig {
  title: string
  description: string
  url: string
  author: FeedSiteAuthor
  feed?: {
    folo?: {
      challenge?: {
        feedId?: string
        userId?: string
      } | null
    } | null
  }
}

export function generateRSSFeed(photos: readonly PhotoManifestItem[], config: FeedSiteConfig): string {
  const now = new Date().toUTCString()
  const latestPhoto = photos[0]
  const lastBuildDate = latestPhoto ? new Date(latestPhoto.dateTaken).toUTCString() : now

  const rssItems = photos
    .map((photo) => createItemEntry(photo, config))
    .filter((entry): entry is string => entry.length > 0)
    .join('\n')

  const serializedChallenge = serializeFollowChallenge(config)

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:exif="https://afilmory.com/rss/exif/1.1">
  <channel>
    <title><![CDATA[${config.title}]]></title>
    <link>${config.url}</link>
    <description><![CDATA[${config.description}]]></description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <pubDate>${now}</pubDate>
    <ttl>60</ttl>
    <copyright>Copyright ${config.author.name}</copyright>
    
    <!-- Afilmory RSS EXIF Extension Protocol Metadata -->
    <exif:version>1.1</exif:version>
    <exif:protocol>afilmory-rss-exif</exif:protocol>
${serializedChallenge}
    <atom:link href="${config.url}/feed.xml" rel="self" type="application/rss+xml" />
    <managingEditor>${config.author.name}</managingEditor>
    <webMaster>${config.author.name}</webMaster>
    <generator>Afilmory RSS Generator</generator>
    <image>
      <url>${config.author.avatar || `${config.url}/favicon.ico`}</url>
      <title><![CDATA[${config.title}]]></title>
      <link>${config.url}</link>
    </image>
${rssItems}
  </channel>
</rss>`
}

function createItemEntry(photo: PhotoManifestItem, config: FeedSiteConfig): string {
  const photoUrl = buildAbsoluteUrl(config.url, photo.id)
  const pubDate = toUTCDateString(photo.dateTaken)
  const tags = Array.isArray(photo.tags) ? photo.tags.filter(Boolean) : []

  let description = photo.description || photo.title || ''
  if (!description) {
    description = photo.tags?.join(', ') ?? ''
  }
  if (tags.length > 0) {
    description += description ? ` | Tags: ${tags.join(', ')}` : `Tags: ${tags.join(', ')}`
  }

  const enclosureUrl = resolveAssetUrl(config.url, photo.thumbnailUrl)
  const enclosureLength = typeof photo.size === 'number' ? photo.size : Number.parseInt(String(photo.size ?? 0), 10)

  const exifTags = generateExifTags(photo.exif, photo)
  const categoryEntries = tags.map((tag) => `      <category><![CDATA[${tag}]]></category>`).join('\n')

  return `    <item>
      <title><![CDATA[${photo.title}]]></title>
      <link>${photoUrl}</link>
      <guid isPermaLink="true">${photoUrl}</guid>
      <description><![CDATA[${description}]]></description>
      <pubDate>${pubDate}</pubDate>
${categoryEntries}
      <enclosure url="${enclosureUrl}" type="image/jpeg" length="${Number.isFinite(enclosureLength) ? enclosureLength : 0}" />
${exifTags}
    </item>`
}

function serializeFollowChallenge(config: FeedSiteConfig): string {
  const feedId = config.feed?.folo?.challenge?.feedId
  const userId = config.feed?.folo?.challenge?.userId

  if (!feedId && !userId) {
    return ''
  }

  const serializedFeedId = feedId ? `<feedId>${feedId}</feedId>` : ''
  const serializedUserId = userId ? `<userId>${userId}</userId>` : ''

  return `    <follow_challenge>
    ${serializedFeedId}
    ${serializedUserId}
</follow_challenge>`
}

function generateExifTags(exif: PickedExif | null | undefined, photo: PhotoManifestItem): string {
  if (!exif) {
    return ''
  }

  const tags: string[] = []

  const aperture = isFiniteNumber(exif.FNumber) ? `f/${formatDecimal(exif.FNumber)}` : null
  if (aperture) {
    tags.push(`      <exif:aperture>${aperture}</exif:aperture>`)
  }

  const shutterSpeed = formatShutterSpeed(exif)
  if (shutterSpeed) {
    tags.push(`      <exif:shutterSpeed>${shutterSpeed}</exif:shutterSpeed>`)
  }

  const iso = getISOValue(exif)
  if (iso !== null) {
    tags.push(`      <exif:iso>${iso}</exif:iso>`)
  }

  const exposureCompensation = getExposureCompensation(exif)
  if (exposureCompensation) {
    tags.push(`      <exif:exposureCompensation>${exposureCompensation}</exif:exposureCompensation>`)
  }

  tags.push(
    `      <exif:imageWidth>${photo.width}</exif:imageWidth>`,
    `      <exif:imageHeight>${photo.height}</exif:imageHeight>`,
  )

  const dateTaken = formatDateTaken(exif, photo)
  if (dateTaken) {
    tags.push(`      <exif:dateTaken>${dateTaken}</exif:dateTaken>`)
  }

  if (exif.Make && exif.Model) {
    tags.push(`      <exif:camera><![CDATA[${exif.Make} ${exif.Model}]]></exif:camera>`)
  }

  if (exif.Orientation !== undefined && exif.Orientation !== null) {
    tags.push(`      <exif:orientation>${exif.Orientation}</exif:orientation>`)
  }

  if (exif.LensModel) {
    tags.push(`      <exif:lens><![CDATA[${exif.LensModel}]]></exif:lens>`)
  }

  const focalLength = formatFocalLength(exif.FocalLength)
  if (focalLength) {
    tags.push(`      <exif:focalLength>${focalLength}</exif:focalLength>`)
  }

  const focalLength35mm = formatFocalLength(exif.FocalLengthIn35mmFormat)
  if (focalLength35mm) {
    tags.push(`      <exif:focalLength35mm>${focalLength35mm}</exif:focalLength35mm>`)
  }

  if (isFiniteNumber(exif.MaxApertureValue)) {
    const maxAperture = Math.pow(2, exif.MaxApertureValue / 2)
    tags.push(`      <exif:maxAperture>f/${formatDecimal(maxAperture)}</exif:maxAperture>`)
  }

  const latitude = normalizeCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef)
  const longitude = normalizeCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef)
  if (latitude !== null && longitude !== null) {
    tags.push(
      `      <exif:gpsLatitude>${latitude}</exif:gpsLatitude>`,
      `      <exif:gpsLongitude>${longitude}</exif:gpsLongitude>`,
    )
  }

  if (isFiniteNumber(exif.GPSAltitude)) {
    const altitude =
      exif.GPSAltitudeRef && isBelowSeaLevel(exif.GPSAltitudeRef)
        ? -Math.abs(exif.GPSAltitude)
        : Math.abs(exif.GPSAltitude)
    tags.push(`      <exif:altitude>${formatDecimal(altitude, 2)}m</exif:altitude>`)
  }

  const whiteBalance = normalizeStringValue(exif.WhiteBalance)
  if (whiteBalance) {
    tags.push(`      <exif:whiteBalance>${whiteBalance}</exif:whiteBalance>`)
  }

  const meteringMode = normalizeStringValue(exif.MeteringMode)
  if (meteringMode) {
    tags.push(`      <exif:meteringMode>${meteringMode}</exif:meteringMode>`)
  }

  const flashMode = formatFlashMode(exif.Flash)
  if (flashMode) {
    tags.push(`      <exif:flashMode>${flashMode}</exif:flashMode>`)
  }

  const colorSpace = normalizeStringValue(exif.ColorSpace)
  if (colorSpace) {
    tags.push(`      <exif:colorSpace>${colorSpace}</exif:colorSpace>`)
  }

  const exposureProgram = normalizeStringValue(exif.ExposureProgram)
  if (exposureProgram) {
    tags.push(`      <exif:exposureProgram>${exposureProgram}</exif:exposureProgram>`)
  }

  const sceneMode = normalizeStringValue(exif.SceneCaptureType)
  if (sceneMode) {
    tags.push(`      <exif:sceneMode><![CDATA[${sceneMode}]]></exif:sceneMode>`)
  }

  const brightness = toNumber(exif.BrightnessValue)
  if (brightness !== null) {
    tags.push(`      <exif:brightness>${formatDecimal(brightness, 2)} EV</exif:brightness>`)
  }

  const lightValue = toNumber(exif.LightValue)
  if (lightValue !== null) {
    tags.push(`      <exif:lightValue>${formatDecimal(lightValue, 2)}</exif:lightValue>`)
  }

  return tags.join('\n')
}

function formatDateTaken(exif: PickedExif, photo: PhotoManifestItem): string | null {
  const rawDate = exif.DateTimeOriginal
  if (rawDate) {
    try {
      return new Date(rawDate).toISOString()
    } catch {
      // fallthrough
    }
  }
  return photo.dateTaken ? new Date(photo.dateTaken).toISOString() : null
}

function formatShutterSpeed(exif: PickedExif): string | null {
  const raw = exif.ExposureTime ?? exif.ShutterSpeed ?? exif.ShutterSpeedValue
  if (raw === null || raw === undefined) {
    return null
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null
    }
    return raw >= 1 ? `${stripTrailingZeros(raw)}s` : `1/${Math.round(1 / raw)}s`
  }

  const value = raw.toString().trim()
  if (!value) {
    return null
  }

  if (value.endsWith('s')) {
    return value
  }

  return `${value}s`
}

function getISOValue(exif: PickedExif): number | null {
  if (isFiniteNumber(exif.ISO)) {
    return Math.round(exif.ISO)
  }

  const isoFromExif = (exif as unknown as Record<string, unknown>).ISOSpeedRatings
  const iso = toNumber(isoFromExif)
  return iso !== null ? Math.round(iso) : null
}

function getExposureCompensation(exif: PickedExif): string | null {
  const value = toNumber(exif.ExposureCompensation ?? (exif as unknown as Record<string, unknown>).ExposureBiasValue)
  if (value === null) {
    return null
  }

  const formatted = formatDecimal(value, 2)
  if (value > 0 && !formatted.startsWith('+')) {
    return `+${formatted} EV`
  }
  return `${formatted} EV`
}

function formatFocalLength(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return `${formatDecimal(value)}mm`
  }

  const text = value.toString().trim()
  if (!text) {
    return null
  }

  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) {
    return text.endsWith('mm') ? text : `${text}mm`
  }

  const numeric = Number.parseFloat(match[0])
  if (Number.isNaN(numeric)) {
    return text.endsWith('mm') ? text : `${text}mm`
  }

  return `${formatDecimal(numeric)}mm`
}

function normalizeCoordinate(
  value: PickedExif['GPSLatitude'] | PickedExif['GPSLongitude'],
  ref: PickedExif['GPSLatitudeRef'] | PickedExif['GPSLongitudeRef'],
): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    return convertDMSToDD(value, ref)
  }

  if (typeof value === 'number') {
    return applyGPSRef(value, ref)
  }

  const match = value.toString().match(/-?\d+(?:\.\d+)?/)
  if (!match) {
    return null
  }
  const numeric = Number.parseFloat(match[0])
  if (Number.isNaN(numeric)) {
    return null
  }

  return applyGPSRef(numeric, ref)
}

function convertDMSToDD(
  dms: readonly number[],
  ref: PickedExif['GPSLatitudeRef'] | PickedExif['GPSLongitudeRef'],
): number | null {
  if (!dms || dms.length !== 3) return null

  const [degrees, minutes, seconds] = dms
  if ([degrees, minutes, seconds].some((value) => !Number.isFinite(value))) {
    return null
  }

  const value = degrees + minutes / 60 + seconds / 3600
  return applyGPSRef(value, ref)
}

function applyGPSRef(value: number, ref: PickedExif['GPSLatitudeRef'] | PickedExif['GPSLongitudeRef']): number {
  if (!ref) {
    return roundCoordinate(value)
  }

  const negativeTokens = ['S', 'W', 'South', 'West']
  const shouldNegate = negativeTokens.some((token) => ref.toString().toLowerCase().includes(token.toLowerCase()))

  const signed = shouldNegate ? -Math.abs(value) : Math.abs(value)
  return roundCoordinate(signed)
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function isBelowSeaLevel(ref: PickedExif['GPSAltitudeRef']): boolean {
  if (!ref) return false
  if (typeof ref === 'number') {
    return ref === 1
  }
  const normalized = ref.toString().toLowerCase()
  return normalized.includes('below') || normalized === '1'
}

function normalizeStringValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const text = value.toString().trim()
  return text ?? null
}

function formatFlashMode(value: PickedExif['Flash']): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return (value & 0x01) !== 0 ? 'On' : 'Off'
  }

  const text = value.toString().toLowerCase()
  if (!text) {
    return null
  }

  if (text.includes('on')) {
    return 'On'
  }
  if (text.includes('off') || text.includes('no flash')) {
    return 'Off'
  }
  if (text.includes('auto')) {
    return 'Auto'
  }
  if (text.includes('red-eye')) {
    return 'Red-eye'
  }
  return value.toString()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value)
    return Number.isNaN(numeric) ? null : numeric
  }
  return null
}

function formatDecimal(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const fixed = value.toFixed(fractionDigits)
  return stripTrailingZeros(Number.parseFloat(fixed))
}

function stripTrailingZeros(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const text = value.toString()
  if (!text.includes('.')) {
    return text
  }
  return text.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function buildAbsoluteUrl(baseUrl: string, id: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const normalizedId = id.startsWith('/') ? id.slice(1) : id
  return `${normalizedBase}/${normalizedId}`
}

function resolveAssetUrl(baseUrl: string, candidate: string | null | undefined): string {
  if (!candidate) {
    return `${normalizeBaseUrl(baseUrl)}/favicon.ico`
  }
  if (/^https?:\/\//i.test(candidate)) {
    return candidate
  }
  return `${normalizeBaseUrl(baseUrl)}${candidate.startsWith('/') ? candidate : `/${candidate}`}`
}

function normalizeBaseUrl(url: string): string {
  if (!url) return ''
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function toUTCDateString(value: string | null | undefined): string {
  if (!value) {
    return new Date(0).toUTCString()
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toUTCString()
  }
  return parsed.toUTCString()
}
