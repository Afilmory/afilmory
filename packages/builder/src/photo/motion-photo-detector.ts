import type { ConsolaInstance } from 'consola'
import type { ContainerDirectoryItem } from 'exiftool-vendored'

export interface MotionPhotoMetadata {
  isMotionPhoto: boolean
  motionPhotoOffset?: number
  motionPhotoVideoSize?: number
  presentationTimestampUs?: number
}

interface MotionPhotoDetectParams {
  rawImageBuffer: Buffer
  exifData?: Record<string, unknown> | null
  logger?: ConsolaInstance
}

const MIN_VIDEO_SIZE_BYTES = 8 * 1024 // 8KB minimal sanity check
const MP4_FTYP = Buffer.from('ftyp')

const toBoolean = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'bigint') return value !== 0n
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return false
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const validateMp4Buffer = (buffer: Buffer): boolean => {
  if (buffer.length < MIN_VIDEO_SIZE_BYTES) {
    return false
  }

  // MP4 should contain 'ftyp' brand within the first few bytes
  const searchWindow = buffer.subarray(0, 32)
  return searchWindow.includes(MP4_FTYP)
}

/**
 * Detects Motion Photo metadata using Android Motion Photo format 1.0 specification.
 * Supports both standard ContainerDirectory format and legacy MicroVideo format.
 */
export const detectMotionPhoto = ({
  rawImageBuffer,
  exifData,
  logger,
}: MotionPhotoDetectParams): MotionPhotoMetadata | null => {
  try {
    const rawLength = rawImageBuffer.length

    // Check Motion Photo flags (standard and legacy)
    const isMotionPhotoFlag = toBoolean(exifData?.MotionPhoto) || toBoolean(exifData?.MicroVideo)

    const presentationTimestampUs = toNumber(
      exifData?.MotionPhotoPresentationTimestampUs ?? exifData?.MicroVideoPresentationTimestampUs,
    )

    let videoOffset: number | null = null
    let videoSize: number | null = null

    // Try standard format (Motion Photo 1.0 with ContainerDirectory)
    const containerDirectory = exifData?.ContainerDirectory as ContainerDirectoryItem[] | undefined
    if (containerDirectory && Array.isArray(containerDirectory)) {
      logger?.info('[motion-photo] Found ContainerDirectory, using standard format')

      // Find video item
      for (const entry of containerDirectory) {
        const item = entry.Item
        if (!item) continue

        if (item.Semantic === 'MotionPhoto' && item.Length) {
          // Video is stored at the end of file, Length bytes from the end
          const offset = rawLength - item.Length
          if (offset > 0 && offset < rawLength - MIN_VIDEO_SIZE_BYTES) {
            const chunk = rawImageBuffer.subarray(offset)
            if (validateMp4Buffer(chunk)) {
              videoOffset = offset
              videoSize = item.Length
              logger?.success(
                `[motion-photo] Found video via ContainerDirectory: offset=${offset}, size=${item.Length}`,
              )
            } else {
              logger?.warn(`[motion-photo] Invalid MP4 at ContainerDirectory offset ${offset}`)
            }
          }
        }
      }
    }

    // Fallback to legacy format (MicroVideo with MicroVideoOffset)
    if (videoOffset === null && isMotionPhotoFlag) {
      const legacyOffset = toNumber(exifData?.MicroVideoOffset)
      if (legacyOffset !== null) {
        logger?.info('[motion-photo] Using legacy MicroVideoOffset format')

        // Try both interpretations: from start and from end
        const candidates = [legacyOffset, rawLength - legacyOffset].filter(
          (offset) => offset > 0 && offset < rawLength - MIN_VIDEO_SIZE_BYTES,
        )

        for (const offset of candidates) {
          const chunk = rawImageBuffer.subarray(offset)
          if (validateMp4Buffer(chunk)) {
            videoOffset = offset
            videoSize = chunk.length
            logger?.success(`[motion-photo] Found video via legacy offset: ${offset}`)
            break
          }
        }
      }
    }

    // No motion photo found
    if (videoOffset === null || videoSize === null) {
      if (isMotionPhotoFlag) {
        logger?.warn('[motion-photo] MotionPhoto flag set but no valid video found')
      }
      return null
    }

    return {
      isMotionPhoto: true,
      motionPhotoOffset: videoOffset,
      motionPhotoVideoSize: videoSize,
      presentationTimestampUs: presentationTimestampUs ?? undefined,
    }
  } catch (error) {
    logger?.error('[motion-photo] Unexpected error while detecting', error)
    return null
  }
}
