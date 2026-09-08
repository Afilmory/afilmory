import type { PhotoRegion } from '@afilmory/builder'
import type { ExiftoolXmpRegion, ExiftoolXmpRegionInfo } from '@afilmory/typing'

export interface PhotoRegionBounds {
  left: number
  top: number
  width: number
  height: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function getPhotoRegionBounds(
  region: PhotoRegion,
  fallbackWidth?: number,
  fallbackHeight?: number,
  orientation?: number,
): PhotoRegionBounds | null {
  const { area } = region
  if (!area) {
    return null
  }

  const rawBounds
    = area.unit.toLowerCase() === 'normalized'
      ? normalizeBounds({
          left: area.x - area.width / 2,
          top: area.y - area.height / 2,
          width: area.width,
          height: area.height,
        })
      : getPixelBounds(region, fallbackWidth, fallbackHeight)

  if (!rawBounds) {
    return null
  }

  return applyOrientation(rawBounds, orientation)
}

export function getRenderablePhotoRegions(
  regions: PhotoRegion[] | undefined,
  photoWidth?: number,
  photoHeight?: number,
  orientation?: number,
  regionInfo?: ExiftoolXmpRegionInfo,
) {
  return (regions ?? [])
    .map((region, index) => getRegionWithExifArea(region, regionInfo?.RegionList?.[index]))
    .filter(region => getPhotoRegionBounds(region, photoWidth, photoHeight, orientation) !== null)
}

function getRegionWithExifArea(region: PhotoRegion, exifRegion?: ExiftoolXmpRegion): PhotoRegion {
  if (region.area || !exifRegion?.Area) {
    return region
  }

  const { X: x, Y: y, W: width, H: height, Unit: unit } = exifRegion.Area
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    return region
  }

  return {
    ...region,
    area: { x, y, width, height, unit: unit ?? 'normalized' },
  }
}

function getPixelBounds(
  region: PhotoRegion,
  fallbackWidth?: number,
  fallbackHeight?: number,
): PhotoRegionBounds | null {
  const { area } = region
  if (!area) {
    return null
  }

  const unit = area.unit.toLowerCase()
  if (unit === 'normalized') {
    return null
  }

  const referenceWidth = region.appliedToDimensions?.width ?? fallbackWidth
  const referenceHeight = region.appliedToDimensions?.height ?? fallbackHeight
  if (!referenceWidth || !referenceHeight) {
    return null
  }

  return normalizeBounds({
    left: (area.x - area.width / 2) / referenceWidth,
    top: (area.y - area.height / 2) / referenceHeight,
    width: area.width / referenceWidth,
    height: area.height / referenceHeight,
  })
}

function applyOrientation(bounds: PhotoRegionBounds, orientation?: number): PhotoRegionBounds | null {
  switch (orientation) {
    case 3:
      return normalizeBounds({
        left: 1 - (bounds.left + bounds.width),
        top: 1 - (bounds.top + bounds.height),
        width: bounds.width,
        height: bounds.height,
      })
    case 6:
      return normalizeBounds({
        left: 1 - (bounds.top + bounds.height),
        top: bounds.left,
        width: bounds.height,
        height: bounds.width,
      })
    case 8:
      return normalizeBounds({
        left: bounds.top,
        top: 1 - (bounds.left + bounds.width),
        width: bounds.height,
        height: bounds.width,
      })
    default:
      return bounds
  }
}

function normalizeBounds(bounds: PhotoRegionBounds): PhotoRegionBounds | null {
  const left = clamp01(bounds.left)
  const top = clamp01(bounds.top)
  const right = clamp01(bounds.left + bounds.width)
  const bottom = clamp01(bounds.top + bounds.height)

  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    left,
    top,
    width,
    height,
  }
}

export function getFloatingLabelPosition(regionTop: number, overlayHeight: number): 'above' | 'below' {
  return regionTop * overlayHeight < 34 ? 'below' : 'above'
}
