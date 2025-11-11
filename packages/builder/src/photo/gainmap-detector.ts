import type { ConsolaInstance } from 'consola'
import type { ContainerDirectoryItem } from 'exiftool-vendored'

interface GainMapDetectParams {
  exifData?: Record<string, unknown> | null
  logger?: ConsolaInstance
}

/**
 * Detects HDR GainMap from ContainerDirectory metadata.
 * Works for both static Ultra HDR images and Motion Photo + HDR combinations.
 */
export const detectGainMap = ({ exifData, logger }: GainMapDetectParams): boolean => {
  try {
    const containerDirectory = exifData?.ContainerDirectory as ContainerDirectoryItem[] | undefined
    if (!containerDirectory || !Array.isArray(containerDirectory)) {
      return false
    }

    // Find GainMap item
    for (const entry of containerDirectory) {
      const item = entry.Item
      if (!item) continue

      if (item.Semantic === 'GainMap' && item.Length) {
        logger?.info('[gainmap] Found HDR GainMap in ContainerDirectory')
        return true
      }
    }

    return false
  } catch (error) {
    logger?.error('[gainmap] Unexpected error while detecting', error)
    return false
  }
}
