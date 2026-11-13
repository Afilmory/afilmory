import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { CanvasPhoto, Instance, Rect } from '../types'
import { createWallLayout, wallInstances } from './wall'

const RATIOS = [0.667, 1.5, 1.333, 0.75]
const makePhotos = (count: number): CanvasPhoto[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    aspectRatio: RATIOS[index % RATIOS.length],
    thumbnailUrl: `/thumbnails/p${index}.jpg`,
    thumbHash: null,
    dateTaken: '2025-05-10T00:00:00Z',
    camera: null,
    tags: [],
    place: null,
  }))

const options = { columnWidth: 200, gap: 10, minPeriod: { width: 2000, height: 1500 } }

const byColumn = (instances: Instance[]) => {
  const columns = new Map<number, Instance[]>()
  for (const instance of instances) {
    const list = columns.get(instance.x) ?? []
    list.push(instance)
    columns.set(instance.x, list)
  }
  for (const list of columns.values()) {
    list.sort((a, b) => a.y - b.y)
  }
  return columns
}

const assertCovers = (instances: Instance[], rect: Rect, stride: number, gap: number) => {
  const columns = byColumn(instances)
  for (let x = Math.floor(rect.x / stride) * stride; x < rect.x + rect.w; x += stride) {
    const list = columns.get(x)
    assert.ok(list && list.length > 0, `no instances in column at x=${x}`)
    assert.ok(list[0].y <= rect.y + gap, `column ${x} starts below the rect top`)
    const last = list.at(-1)!
    assert.ok(last.y + last.h >= rect.y + rect.h - gap, `column ${x} ends above the rect bottom`)
    for (let i = 1; i < list.length; i++) {
      const space = list[i].y - (list[i - 1].y + list[i - 1].h)
      assert.ok(Math.abs(space - gap) < 1e-6, `column ${x} has a ${space}px gap`)
    }
  }
}

for (const [name, origin] of [
  ['right', { x: 1_000_000, y: 0 }],
  ['left', { x: -1_000_000, y: 0 }],
  ['down', { x: 0, y: 1_000_000 }],
  ['up', { x: 0, y: -1_000_000 }],
] as const) {
  it(`wallInstances covers a viewport far to the ${name}`, () => {
    const layout = createWallLayout(makePhotos(18), options)
    const rect = { x: origin.x + 37, y: origin.y - 53, w: 1280, h: 800 }
    assertCovers(wallInstances(layout, rect), rect, layout.stride, options.gap)
  })
}

it('wallInstances gives every visible copy a unique key', () => {
  const layout = createWallLayout(makePhotos(18), options)
  const instances = wallInstances(layout, { x: -3000, y: -3000, w: 6000, h: 6000 })
  assert.equal(new Set(instances.map(instance => instance.key)).size, instances.length)
})

it('wallInstances sizes each photo from its aspect ratio', () => {
  const photos = makePhotos(18)
  const layout = createWallLayout(photos, options)
  for (const instance of wallInstances(layout, { x: 0, y: 0, w: 1280, h: 800 })) {
    assert.equal(instance.w, 200)
    assert.ok(Math.abs(instance.h - 200 / photos[instance.photoIndex].aspectRatio) < 1e-6)
  }
})

it('with few photos no column repeats a photo and neighbouring columns share none', () => {
  const layout = createWallLayout(makePhotos(18), options)
  const sets = layout.columns.map(column => column.items.map(item => item.photoIndex))
  sets.forEach((indexes, c) => {
    assert.equal(new Set(indexes).size, indexes.length, `column ${c} repeats a photo`)
    const next = new Set(sets[(c + 1) % sets.length])
    assert.ok(!indexes.some(index => next.has(index)), `columns ${c} and ${c + 1} share a photo`)
  })
})

it('with few photos the tile is still at least as wide as the minimum period', () => {
  const layout = createWallLayout(makePhotos(18), options)
  assert.ok(layout.tileWidth >= options.minPeriod.width)
})

it('with few photos every photo appears somewhere on the wall', () => {
  const layout = createWallLayout(makePhotos(18), options)
  const seen = new Set(layout.columns.flatMap(column => column.items.map(item => item.photoIndex)))
  assert.equal(seen.size, 18)
})

it('with many photos each photo appears exactly once per tile', () => {
  const layout = createWallLayout(makePhotos(600), options)
  const counts = new Map<number, number>()
  for (const column of layout.columns) {
    for (const item of column.items) {
      counts.set(item.photoIndex, (counts.get(item.photoIndex) ?? 0) + 1)
    }
  }
  assert.equal(counts.size, 600)
  assert.ok([...counts.values()].every(count => count === 1))
})

it('with many photos the tile and every column period reach the minimum period', () => {
  const layout = createWallLayout(makePhotos(600), options)
  assert.ok(layout.tileWidth >= options.minPeriod.width)
  for (const column of layout.columns) {
    assert.ok(column.period >= options.minPeriod.height)
  }
})

it('keeps input order: the first photo opens the first column', () => {
  for (const count of [18, 600]) {
    const layout = createWallLayout(makePhotos(count), options)
    assert.equal(layout.columns[0].items[0].photoIndex, 0)
  }
})

it('a single photo still produces a wall that covers the viewport', () => {
  const layout = createWallLayout(makePhotos(1), options)
  const rect = { x: -640, y: -400, w: 1280, h: 800 }
  assertCovers(wallInstances(layout, rect), rect, layout.stride, options.gap)
})

it('no photos produce no instances', () => {
  const layout = createWallLayout([], options)
  assert.deepEqual(wallInstances(layout, { x: 0, y: 0, w: 1280, h: 800 }), [])
})

it('with few photos a photo does not come back within the next two columns', () => {
  const layout = createWallLayout(makePhotos(18), options)
  const sets = layout.columns.map(column => new Set(column.items.map(item => item.photoIndex)))
  sets.forEach((indexes, c) => {
    for (const step of [1, 2]) {
      const other = sets[(c + step) % sets.length]
      assert.ok(![...indexes].some(index => other.has(index)), `columns ${c} and ${c + step} share a photo`)
    }
  })
})
