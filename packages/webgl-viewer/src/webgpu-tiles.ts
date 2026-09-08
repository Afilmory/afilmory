import type { ImageViewportState } from './interface'
import type { GainMapMetadata, Matrix3 } from './jpeg-gainmap'

export const TILE_SIZE = 1024
export const TEXTURE_BUDGET = 128 * 1024 * 1024
export const MAX_PENDING_TILES = 2
export const OVERVIEW_SIZE = 2048
export const TILE_GUTTER = 2

export type Rect = [number, number, number, number]
export interface TileRequest {
  key: string
  level: number
  rect: Rect
}
export interface BitmapPlane {
  bitmap: ImageBitmap
  uv: Rect
}
export interface TilePixels extends TileRequest {
  base: BitmapPlane
  gain?: BitmapPlane
}
export interface ImagePixels extends TilePixels {
  width: number
  height: number
  metadata: GainMapMetadata | null
  toGainSpace?: Matrix3
  toDisplayP3?: Matrix3
  wideGamut: boolean
  warning?: string
}
export type TextureWorkerMessage
  = | { type: 'ready', image: ImagePixels }
    | { type: 'tile', tile: TilePixels }
    | { type: 'error', key?: string, message: string }
export type TextureWorkerRequest = { type: 'load', url: string } | { type: 'tile', tile: TileRequest }

export function intersects(a: Rect, b: Rect) {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]
}

export function getVisibleTileRequests(
  viewport: ImageViewportState,
  dpr: number,
  overviewLevel: number,
  availableBytes: number,
  bytesPerPixel: number,
): TileRequest[] {
  const { scale, translateX, translateY, containerWidth, containerHeight, imageWidth, imageHeight } = viewport
  if (scale <= 0 || !Number.isFinite(scale) || imageWidth <= 0 || imageHeight <= 0) {
    return []
  }
  const left = (containerWidth - imageWidth * scale) / 2 + translateX
  const top = (containerHeight - imageHeight * scale) / 2 + translateY
  const x0 = Math.max(0, -left / scale)
  const y0 = Math.max(0, -top / scale)
  const x1 = Math.min(imageWidth, (containerWidth - left) / scale)
  const y1 = Math.min(imageHeight, (containerHeight - top) / scale)
  if (x1 <= x0 || y1 <= y0) {
    return []
  }
  let level = Math.max(0, Math.floor(Math.log2(1 / Math.min(1, scale * dpr))))
  while (level < overviewLevel) {
    const span = TILE_SIZE * 2 ** level
    const requests: TileRequest[] = []
    for (let y = Math.floor(y0 / span); y < Math.ceil(y1 / span); y++) {
      for (let x = Math.floor(x0 / span); x < Math.ceil(x1 / span); x++) {
        requests.push({
          key: `${level}:${x}:${y}`,
          level,
          rect: [x * span, y * span, Math.min(span, imageWidth - x * span), Math.min(span, imageHeight - y * span)],
        })
      }
    }
    const estimatedBytes = requests.reduce(
      (sum, { rect }) =>
        sum
        + (Math.ceil(rect[2] / 2 ** level) + TILE_GUTTER * 2)
        * (Math.ceil(rect[3] / 2 ** level) + TILE_GUTTER * 2)
        * bytesPerPixel,
      0,
    )
    if (estimatedBytes <= availableBytes) {
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      return requests.sort(
        (a, b) =>
          Math.hypot(a.rect[0] + a.rect[2] / 2 - cx, a.rect[1] + a.rect[3] / 2 - cy)
          - Math.hypot(b.rect[0] + b.rect[2] / 2 - cx, b.rect[1] + b.rect[3] / 2 - cy),
      )
    }
    level++
  }
  return []
}

export function closeTilePixels(tile: TilePixels) {
  tile.base.bitmap.close()
  tile.gain?.bitmap.close()
}
