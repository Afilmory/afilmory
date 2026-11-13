import type { Arrangement, CanvasPhoto } from '../types'

export type GroupDimension = Exclude<Arrangement, 'wall'>

export interface PhotoGroup {
  key: string
  kind: 'value' | 'other' | 'missing'
  label: string
  photoIndexes: number[]
}

export const MAX_ISLANDS = 60

const MONTH_PATTERN = /^(\d{4})-(\d{2})/

const monthOf = (photo: CanvasPhoto) => {
  const match = MONTH_PATTERN.exec(photo.dateTaken)
  return match ? { year: match[1], month: match[2] } : null
}

const valuesOf = (photo: CanvasPhoto, dimension: GroupDimension, byYear: boolean): string[] => {
  if (dimension === 'month') {
    const date = monthOf(photo)
    if (!date) {
      return []
    }
    return [byYear ? date.year : `${date.year} · ${date.month}`]
  }
  if (dimension === 'camera') {
    return photo.camera ? [photo.camera] : []
  }
  if (dimension === 'tag') {
    return photo.tags
  }
  return photo.place ? [photo.place] : []
}

const collect = (photos: CanvasPhoto[], dimension: GroupDimension, byYear: boolean) => {
  const groups = new Map<string, PhotoGroup>()
  const missing: number[] = []
  photos.forEach((photo, photoIndex) => {
    const values = valuesOf(photo, dimension, byYear)
    if (values.length === 0) {
      missing.push(photoIndex)
      return
    }
    for (const value of values) {
      let group = groups.get(value)
      if (!group) {
        group = { key: `v-${groups.size}`, kind: 'value', label: value, photoIndexes: [] }
        groups.set(value, group)
      }
      group.photoIndexes.push(photoIndex)
    }
  })
  return { groups: [...groups.values()], missing }
}

const capGroups = (groups: PhotoGroup[], reserved: number): PhotoGroup[] => {
  if (groups.length + reserved <= MAX_ISLANDS) {
    return groups
  }
  const keepCount = MAX_ISLANDS - reserved - 1
  const ranked = groups.map((group, order) => ({ group, order }))
  ranked.sort((a, b) => b.group.photoIndexes.length - a.group.photoIndexes.length || a.order - b.order)
  const kept = new Set(ranked.slice(0, keepCount).map(entry => entry.group))
  const merged = new Set<number>()
  for (const group of groups) {
    if (!kept.has(group)) {
      for (const photoIndex of group.photoIndexes) {
        merged.add(photoIndex)
      }
    }
  }
  return [
    ...groups.filter(group => kept.has(group)),
    { key: 'other', kind: 'other', label: '', photoIndexes: [...merged].sort((a, b) => a - b) },
  ]
}

export const groupPhotos = (photos: CanvasPhoto[], dimension: GroupDimension): PhotoGroup[] => {
  let collected = collect(photos, dimension, false)
  if (dimension === 'month' && collected.groups.length > MAX_ISLANDS) {
    collected = collect(photos, dimension, true)
  }
  const ordered
    = dimension === 'month'
      ? collected.groups
      : collected.groups
          .map((group, order) => ({ group, order }))
          .sort((a, b) => b.group.photoIndexes.length - a.group.photoIndexes.length || a.order - b.order)
          .map(entry => entry.group)
  const hasMissing = collected.missing.length > 0
  const capped = capGroups(ordered, hasMissing ? 1 : 0)
  if (!hasMissing) {
    return capped
  }
  return [...capped, { key: 'missing', kind: 'missing', label: '', photoIndexes: collected.missing }]
}

export const availableArrangements = (photos: CanvasPhoto[]): Arrangement[] => {
  const dimensions: GroupDimension[] = ['month', 'camera', 'tag', 'location']
  return [
    'wall',
    ...dimensions.filter(dimension => photos.some(photo => valuesOf(photo, dimension, false).length > 0)),
  ]
}
