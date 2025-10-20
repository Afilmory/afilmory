import type { StorageConfig } from './interfaces.js'

type WithOptionalThumbnails = StorageConfig & {
  uploadThumbnails?: boolean
  thumbnailPrefix?: string
}

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`

export const normalizePrefix = (candidate?: string | null): string => {
  if (!candidate) return ''
  const trimmed = candidate.trim()
  if (!trimmed) return ''

  const normalized = trimmed.replaceAll('\\', '/')
  const segments = normalized.split('/').filter((segment) => segment !== '')
  return segments.join('/')
}

export const resolveThumbnailPrefix = (
  config: StorageConfig,
): string | null => {
  const casted = config as WithOptionalThumbnails
  if (!casted.uploadThumbnails) return null

  const basePrefix =
    'prefix' in casted && casted.prefix ? normalizePrefix(casted.prefix) : ''

  const explicit = normalizePrefix(casted.thumbnailPrefix)
  if (explicit) {
    if (basePrefix && explicit === basePrefix) {
      return 'thumbnails/'
    }

    return ensureTrailingSlash(explicit)
  }

  if (basePrefix) {
    return ensureTrailingSlash(`${basePrefix}/thumbnails`)
  }

  return 'thumbnails/'
}

export const resolveThumbnailKey = (
  photoId: string,
  config: StorageConfig,
): string | null => {
  const prefix = resolveThumbnailPrefix(config)
  if (!prefix) return null
  return `${prefix}${photoId}.jpg`
}
