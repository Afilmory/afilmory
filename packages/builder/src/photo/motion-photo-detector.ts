import type { ConsolaInstance } from 'consola'

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

const MAX_XMP_SCAN_BYTES = 512 * 1024 // 512KB should cover standard XMP blocks
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

const extractXmpSegment = (buffer: Buffer): string | null => {
  const scanSize = Math.min(buffer.length, MAX_XMP_SCAN_BYTES)
  if (scanSize === 0) {
    return null
  }

  const header = buffer.toString('utf8', 0, scanSize)
  const startIndex = header.indexOf('<x:xmpmeta')
  if (startIndex === -1) {
    return null
  }

  const endIndex = header.indexOf('</x:xmpmeta>')
  if (endIndex === -1) {
    return null
  }

  return header.slice(startIndex, endIndex + '</x:xmpmeta>'.length)
}

const extractXmpBoolean = (xmp: string, tagName: string): boolean | null => {
  const regex = new RegExp(`<[^:>]*:${tagName}>([^<]+)</[^>]+>`, 'i')
  const match = xmp.match(regex)
  if (!match) return null
  return toBoolean(match[1])
}

const extractXmpNumber = (xmp: string, tagName: string): number | null => {
  const regex = new RegExp(`<[^:>]*:${tagName}>([^<]+)</[^>]+>`, 'i')
  const match = xmp.match(regex)
  if (!match) return null
  return toNumber(match[1])
}

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildAttrPattern = (attrName: string) => {
  const escaped = escapeRegExp(attrName)
  if (attrName.includes(':')) {
    return escaped
  }
  return `(?:[\\w-]+:)?${escaped}`
}

const extractXmpAttributeBoolean = (xmp: string, attrName: string): boolean | null => {
  const regex = new RegExp(`${buildAttrPattern(attrName)}="([^"]+)"`, 'i')
  const match = xmp.match(regex)
  if (!match) return null
  return toBoolean(match[1])
}

const extractXmpAttributeNumber = (xmp: string, attrName: string): number | null => {
  const regex = new RegExp(`${buildAttrPattern(attrName)}="([^"]+)"`, 'i')
  const match = xmp.match(regex)
  if (!match) return null
  return toNumber(match[1])
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
 * Detects Motion Photo metadata from image buffer without extracting the video file.
 * Returns offset and size information for frontend to extract video on-demand.
 */
export const detectMotionPhoto = ({
  rawImageBuffer,
  exifData,
  logger,
}: MotionPhotoDetectParams): MotionPhotoMetadata | null => {
  try {
    const rawLength = rawImageBuffer.length

    const exifIndicatesMotion = toBoolean(exifData?.MotionPhoto) || toBoolean(exifData?.MicroVideo)
    let detectedMotion = exifIndicatesMotion

    let presentationTimestampUs = toNumber(
      exifData?.MotionPhotoPresentationTimestampUs ?? exifData?.MicroVideoPresentationTimestampUs,
    )

    const offsetCandidates = new Set<number>()
    const addOffsetCandidate = (value: number | null | undefined) => {
      if (value === null || value === undefined) return
      if (!Number.isFinite(value)) return
      const numeric = Number(value)
      if (numeric <= 0) return
      offsetCandidates.add(numeric)
    }

    addOffsetCandidate(toNumber(exifData?.MicroVideoOffset))

    const xmpSegment = extractXmpSegment(rawImageBuffer)
    if (xmpSegment) {
      if (!detectedMotion) {
        const motionFlags = [
          extractXmpBoolean(xmpSegment, 'MotionPhoto'),
          extractXmpBoolean(xmpSegment, 'GCamera:MotionPhoto'),
          extractXmpBoolean(xmpSegment, 'MicroVideo'),
          extractXmpBoolean(xmpSegment, 'GCamera:MicroVideo'),
          extractXmpAttributeBoolean(xmpSegment, 'MotionPhoto'),
          extractXmpAttributeBoolean(xmpSegment, 'GCamera:MotionPhoto'),
          extractXmpAttributeBoolean(xmpSegment, 'MicroVideo'),
          extractXmpAttributeBoolean(xmpSegment, 'GCamera:MicroVideo'),
        ].filter((flag) => flag !== null) as boolean[]

        if (motionFlags.some(Boolean)) {
          detectedMotion = true
          logger?.info('[motion-photo] XMP detected MotionPhoto flags')
        }
      }

      ;[
        extractXmpNumber(xmpSegment, 'MicroVideoOffset'),
        extractXmpNumber(xmpSegment, 'GCamera:MicroVideoOffset'),
        extractXmpAttributeNumber(xmpSegment, 'MicroVideoOffset'),
        extractXmpAttributeNumber(xmpSegment, 'GCamera:MicroVideoOffset'),
      ].forEach((candidate) => addOffsetCandidate(candidate))

      if (presentationTimestampUs === null) {
        presentationTimestampUs =
          extractXmpNumber(xmpSegment, 'MotionPhotoPresentationTimestampUs') ??
          extractXmpNumber(xmpSegment, 'MicroVideoPresentationTimestampUs') ??
          extractXmpAttributeNumber(xmpSegment, 'MotionPhotoPresentationTimestampUs') ??
          extractXmpAttributeNumber(xmpSegment, 'MicroVideoPresentationTimestampUs') ??
          null
      }
    }

    if (!detectedMotion && offsetCandidates.size === 0) {
      return null
    }

    let resolvedOffset: number | null = null
    let videoSize: number | null = null

    const candidateList = Array.from(offsetCandidates)
    for (const candidate of candidateList) {
      const possibleStarts = new Set<number>()
      possibleStarts.add(candidate)
      if (candidate < rawLength) {
        possibleStarts.add(rawLength - candidate)
      }

      for (const start of possibleStarts) {
        if (start <= 0 || start >= rawLength - MIN_VIDEO_SIZE_BYTES) {
          continue
        }

        const chunk = rawImageBuffer.subarray(start)
        if (validateMp4Buffer(chunk)) {
          resolvedOffset = start
          videoSize = chunk.length
          if (start !== candidate && logger?.debug) {
            logger.debug(`[motion-photo] Interpreted offset ${candidate} as start ${start} from file end`)
          }
          break
        }
      }

      if (resolvedOffset !== null) {
        break
      }
    }

    // Fallback: scan for MP4 signature
    if (resolvedOffset === null) {
      const searchWindowStart = Math.max(0, rawLength - 8 * 1024 * 1024)
      let cursor = rawImageBuffer.indexOf(MP4_FTYP, searchWindowStart)
      while (cursor !== -1) {
        const potentialStart = cursor - 4
        if (potentialStart > 0 && potentialStart < rawLength - MIN_VIDEO_SIZE_BYTES) {
          const chunk = rawImageBuffer.subarray(potentialStart)
          if (validateMp4Buffer(chunk)) {
            resolvedOffset = potentialStart
            videoSize = chunk.length
            logger?.info(`[motion-photo] Located MP4 via fallback scan at offset ${potentialStart}`)
            break
          }
        }
        cursor = rawImageBuffer.indexOf(MP4_FTYP, cursor + 1)
      }
    }

    if (resolvedOffset === null || videoSize === null) {
      logger?.warn(`[motion-photo] Unable to locate MP4 after trying offsets ${candidateList.join(', ') || 'none'}`)
      return null
    }

    logger?.success(`[motion-photo] Detected Motion Photo at offset ${resolvedOffset}, video size ${videoSize} bytes`)

    return {
      isMotionPhoto: true,
      motionPhotoOffset: resolvedOffset,
      motionPhotoVideoSize: videoSize,
      presentationTimestampUs: presentationTimestampUs ?? undefined,
    }
  } catch (error) {
    logger?.error('[motion-photo] Unexpected error while detecting', error)
    return null
  }
}
