import type { CanvasPhoto, Instance, Rect } from '../types'
import type { PhotoGroup } from './grouping'

export interface Island {
  key: string
  kind: PhotoGroup['kind']
  label: string
  count: number
  rect: Rect
}

export interface GroupedLayout {
  islands: Island[]
  instances: Instance[]
  bounds: Rect
}

export interface GroupedOptions {
  columnWidth: number
  gap: number
  islandGap: number
  labelHeight: number
  aspect: number
}

interface IslandDraft {
  group: PhotoGroup
  width: number
  height: number
  items: { photoIndex: number, x: number, y: number, h: number }[]
}

const draftIsland = (group: PhotoGroup, photos: CanvasPhoto[], options: GroupedOptions): IslandDraft => {
  const { columnWidth, gap, labelHeight } = options
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(group.photoIndexes.length)))
  const filled: number[] = []
  for (let c = 0; c < columnCount; c++) {
    filled.push(0)
  }
  const items = group.photoIndexes.map((photoIndex) => {
    let shortest = 0
    for (let c = 1; c < columnCount; c++) {
      if (filled[c] < filled[shortest]) {
        shortest = c
      }
    }
    const h = columnWidth / Math.max(photos[photoIndex].aspectRatio, 0.01)
    const item = { photoIndex, x: shortest * (columnWidth + gap), y: labelHeight + filled[shortest], h }
    filled[shortest] += h + gap
    return item
  })
  return {
    group,
    items,
    width: columnCount * (columnWidth + gap) - gap,
    height: labelHeight + Math.max(0, Math.max(...filled) - gap),
  }
}

export const createGroupedLayout = (
  groups: PhotoGroup[],
  photos: CanvasPhoto[],
  options: GroupedOptions,
): GroupedLayout => {
  const { columnWidth, islandGap, aspect } = options
  const drafts = groups
    .filter(group => group.photoIndexes.length > 0)
    .map(group => draftIsland(group, photos, options))
  if (drafts.length === 0) {
    return { islands: [], instances: [], bounds: { x: 0, y: 0, w: 0, h: 0 } }
  }

  const area = drafts.reduce((sum, draft) => sum + (draft.width + islandGap) * (draft.height + islandGap), 0)
  const widest = Math.max(...drafts.map(draft => draft.width))
  const rowWidth = Math.max(widest, Math.sqrt(area * aspect))

  const islands: Island[] = []
  const instances: Instance[] = []
  let x = 0
  let y = 0
  let rowHeight = 0
  let right = 0
  for (const draft of drafts) {
    if (x > 0 && x + draft.width > rowWidth) {
      x = 0
      y += rowHeight + islandGap
      rowHeight = 0
    }
    const { group } = draft
    islands.push({
      key: group.key,
      kind: group.kind,
      label: group.label,
      count: group.photoIndexes.length,
      rect: { x, y, w: draft.width, h: draft.height },
    })
    for (const item of draft.items) {
      instances.push({
        key: `g:${group.key}:${item.photoIndex}`,
        photoIndex: item.photoIndex,
        x: x + item.x,
        y: y + item.y,
        w: columnWidth,
        h: item.h,
      })
    }
    right = Math.max(right, x + draft.width)
    rowHeight = Math.max(rowHeight, draft.height)
    x += draft.width + islandGap
  }
  return { islands, instances, bounds: { x: 0, y: 0, w: right, h: y + rowHeight } }
}
