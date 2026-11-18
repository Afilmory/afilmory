export const THUMBNAIL_MIN_SCREEN_PX = 48
export const SMALL_VIEW_PHOTO_LIMIT = 600
export const THUMBNAIL_TIERS = [128, 256, 512] as const
export const THUMBNAIL_SOURCE_WIDTH = 600

const UPSCALE_LIMIT = 1.5

export type ThumbnailTier = (typeof THUMBNAIL_TIERS)[number]

export const minScreenPx = (photosInView: number) =>
  photosInView <= SMALL_VIEW_PHOTO_LIMIT ? 0 : THUMBNAIL_MIN_SCREEN_PX

export const pickTier = (
  screenLongEdgeCssPx: number,
  dpr: number,
  minPx = THUMBNAIL_MIN_SCREEN_PX,
): ThumbnailTier | 0 => {
  if (screenLongEdgeCssPx < minPx) {
    return 0
  }
  const devicePixels = screenLongEdgeCssPx * dpr
  return THUMBNAIL_TIERS.find(tier => tier >= devicePixels) ?? 512
}

export const maxScale = (columnWidth: number, dpr: number, thumbnailWidthPx = THUMBNAIL_SOURCE_WIDTH) =>
  (thumbnailWidthPx * UPSCALE_LIMIT) / (columnWidth * dpr)

export const textureBytes = (tier: number) => tier * tier * 4
