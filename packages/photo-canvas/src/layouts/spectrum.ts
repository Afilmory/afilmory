import type { PhotoColor } from '../color'
import { isNeutral } from '../color'
import type { CanvasPhoto, Instance } from '../types'
import type { GroupedLayout } from './grouped'

export interface SpectrumOptions {
  columnWidth: number
  gap: number
  aspect: number
}

const MIN_BUCKETS = 6
const MAX_BUCKETS = 36
const NEUTRAL_GAP_RATIO = 0.4

const chunk = (indexes: number[], size: number) => {
  const chunks: number[][] = []
  for (let start = 0; start < indexes.length; start += size) {
    chunks.push(indexes.slice(start, start + size))
  }
  return chunks
}

export const createSpectrumLayout = (
  photos: CanvasPhoto[],
  colors: (PhotoColor | null)[],
  options: SpectrumOptions,
): GroupedLayout => {
  const { columnWidth, gap, aspect } = options
  if (photos.length === 0) {
    return { islands: [], instances: [], bounds: { x: 0, y: 0, w: 0, h: 0 } }
  }
  const stride = columnWidth + gap
  const heightOf = (photoIndex: number) => columnWidth / Math.max(photos[photoIndex].aspectRatio, 0.01)
  const averageHeight = photos.reduce((sum, _, index) => sum + heightOf(index) + gap, 0) / photos.length
  const targetColumns = Math.max(1, Math.round(Math.sqrt((photos.length * averageHeight * aspect) / stride)))
  const perColumn = Math.max(1, Math.ceil(photos.length / targetColumns))
  const bucketCount = Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, targetColumns))

  const buckets: number[][] = []
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    buckets.push([])
  }
  const neutral: number[] = []
  colors.forEach((color, photoIndex) => {
    if (!color || isNeutral(color)) {
      neutral.push(photoIndex)
      return
    }
    buckets[Math.min(bucketCount - 1, Math.floor((color.h / 360) * bucketCount))].push(photoIndex)
  })

  const lightness = (photoIndex: number) => colors[photoIndex]?.l ?? -1
  const byHueThenLight = (a: number, b: number) => colors[a]!.h - colors[b]!.h || lightness(b) - lightness(a)
  const byLight = (a: number, b: number) => lightness(b) - lightness(a) || a - b

  const columns: (number[] | null)[] = []
  for (const bucket of buckets) {
    if (bucket.length === 0) {
      continue
    }
    bucket.sort(byHueThenLight)
    for (const column of chunk(bucket, perColumn)) {
      columns.push(column.sort(byLight))
    }
  }
  if (neutral.length > 0) {
    if (columns.length > 0) {
      columns.push(null)
    }
    neutral.sort(byLight)
    columns.push(...chunk(neutral, perColumn))
  }

  const instances: Instance[] = []
  let top = 0
  let bottom = 0
  let x = 0
  for (const column of columns) {
    if (!column) {
      x += stride * NEUTRAL_GAP_RATIO
      continue
    }
    const total = column.reduce((sum, photoIndex) => sum + heightOf(photoIndex) + gap, 0) - gap
    let y = -total / 2
    top = Math.min(top, y)
    bottom = Math.max(bottom, y + total)
    for (const photoIndex of column) {
      const h = heightOf(photoIndex)
      instances.push({ key: `s:${photoIndex}`, photoIndex, x, y, w: columnWidth, h })
      y += h + gap
    }
    x += stride
  }
  return {
    islands: [],
    instances,
    bounds: { x: 0, y: top, w: x - gap, h: bottom - top },
  }
}
