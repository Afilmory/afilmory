import type { Buffer } from 'node:buffer'

export const THUMBNAIL_PLUGIN_DATA_KEY = 'afilmory:thumbnail-storage:data'

/**
 * Unique symbol identifier for the thumbnail storage plugin.
 * Used for reliable plugin detection without fragile string matching.
 */
export const THUMBNAIL_PLUGIN_SYMBOL = Symbol.for('afilmory:thumbnail-storage')

export interface ThumbnailPluginData {
  photoId: string
  fileName: string
  buffer: Buffer | null
  localUrl: string | null
}
export const DEFAULT_DIRECTORY = '.afilmory/thumbnails'
export const DEFAULT_CONTENT_TYPE = 'image/jpeg'
