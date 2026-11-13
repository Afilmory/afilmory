import type { CanvasPhoto, Instance, Rect, Size } from '../types'

export interface WallItem {
  photoIndex: number
  y: number
  h: number
}

export interface WallColumn {
  items: WallItem[]
  period: number
  offset: number
}

export interface WallLayout {
  columns: WallColumn[]
  stride: number
  columnWidth: number
  gap: number
  tileWidth: number
}

export interface WallOptions {
  columnWidth: number
  gap: number
  minPeriod: Size
}

const STAGGER_STEP = 173

const mod = (value: number, n: number) => ((value % n) + n) % n

const finishColumns = (stacks: number[][], heights: number[], gap: number): WallColumn[] =>
  stacks.map((indexes, c) => {
    let y = 0
    const items = indexes.map((photoIndex) => {
      const item = { photoIndex, y, h: heights[photoIndex] }
      y += item.h + gap
      return item
    })
    return { items, period: y, offset: y > 0 ? (c * STAGGER_STEP) % y : 0 }
  })

const packOnce = (heights: number[], columnCount: number, gap: number) => {
  const stacks: number[][] = []
  const filled: number[] = []
  for (let c = 0; c < columnCount; c++) {
    stacks.push([])
    filled.push(0)
  }
  heights.forEach((height, photoIndex) => {
    let shortest = 0
    for (let c = 1; c < columnCount; c++) {
      if (filled[c] < filled[shortest]) {
        shortest = c
      }
    }
    stacks[shortest].push(photoIndex)
    filled[shortest] += height + gap
  })
  return { stacks, filled }
}

const packRepeating = (heights: number[], minColumns: number, minHeight: number, gap: number) => {
  const count = heights.length
  const maxPerColumn = Math.max(1, Math.floor(count / 2))
  const stacks: number[][] = []
  let cursor = 0
  const isSettled = () => {
    if (stacks.length < minColumns || cursor < count) {
      return false
    }
    if (count < 2 * maxPerColumn || stacks.length < 2) {
      return true
    }
    const first = new Set(stacks[0])
    return !stacks.at(-1)!.some(index => first.has(index))
  }
  const limit = minColumns + count * 2
  while (!isSettled() && stacks.length < limit) {
    const stack: number[] = []
    let y = 0
    while (y < minHeight && stack.length < maxPerColumn) {
      const photoIndex = cursor % count
      stack.push(photoIndex)
      y += heights[photoIndex] + gap
      cursor++
    }
    stacks.push(stack)
  }
  return stacks
}

export const createWallLayout = (photos: CanvasPhoto[], options: WallOptions): WallLayout => {
  const { columnWidth, gap, minPeriod } = options
  const stride = columnWidth + gap
  const base = { stride, columnWidth, gap }
  if (photos.length === 0) {
    return { ...base, columns: [], tileWidth: 0 }
  }

  const heights = photos.map(photo => columnWidth / Math.max(photo.aspectRatio, 0.01))
  const totalHeight = heights.reduce((sum, height) => sum + height + gap, 0)
  const minColumns = Math.max(1, Math.ceil(minPeriod.width / stride))
  const squareColumns = Math.max(minColumns, Math.ceil(Math.sqrt(totalHeight / stride)))

  const once = packOnce(heights, squareColumns, gap)
  const stacks = once.filled.every(height => height >= minPeriod.height)
    ? once.stacks
    : packRepeating(heights, minColumns, minPeriod.height, gap)

  return { ...base, columns: finishColumns(stacks, heights, gap), tileWidth: stacks.length * stride }
}

export const wallInstances = (layout: WallLayout, rect: Rect): Instance[] => {
  const { columns, stride, columnWidth } = layout
  if (columns.length === 0) {
    return []
  }
  const instances: Instance[] = []
  const bottom = rect.y + rect.h
  const lastColumn = Math.floor((rect.x + rect.w) / stride)
  for (let k = Math.floor(rect.x / stride); k <= lastColumn; k++) {
    const column = columns[mod(k, columns.length)]
    if (column.period <= 0) {
      continue
    }
    const firstCycle = Math.floor((rect.y + column.offset) / column.period)
    for (let cycle = firstCycle; cycle * column.period - column.offset < bottom; cycle++) {
      const top = cycle * column.period - column.offset
      for (const item of column.items) {
        const y = top + item.y
        if (y + item.h < rect.y || y > bottom) {
          continue
        }
        instances.push({
          key: `w:${item.photoIndex}:${k}:${cycle}`,
          photoIndex: item.photoIndex,
          x: k * stride,
          y,
          w: columnWidth,
          h: item.h,
        })
      }
    }
  }
  return instances
}
