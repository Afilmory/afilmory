import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { CanvasPhoto, Rect } from '../types'
import { createGroupedLayout } from './grouped'
import type { PhotoGroup } from './grouping'

const RATIOS = [0.667, 1.5, 1.333, 0.75]
const makePhotos = (count: number): CanvasPhoto[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    aspectRatio: RATIOS[index % RATIOS.length],
    thumbnailUrl: '',
    thumbHash: null,
    dateTaken: '',
    camera: null,
    tags: [],
    place: null,
  }))

const makeGroups = (sizes: number[]): PhotoGroup[] => {
  let next = 0
  return sizes.map((size, g) => {
    const photoIndexes: number[] = []
    for (let n = 0; n < size; n++) {
      photoIndexes.push(next)
      next += 1
    }
    return { key: `g${g}`, kind: 'value' as const, label: `Group ${g}`, photoIndexes }
  })
}

const options = { columnWidth: 200, gap: 10, islandGap: 150, labelHeight: 50, aspect: 1.6 }
const separation = (a: Rect, b: Rect) =>
  Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h))

it('islands never overlap and keep at least the island gap between them', () => {
  const sizes = [7, 1, 30, 2, 2, 12, 1, 90, 3, 5, 5, 18]
  const layout = createGroupedLayout(makeGroups(sizes), makePhotos(176), options)
  assert.equal(layout.islands.length, sizes.length)
  layout.islands.forEach((a, i) => {
    layout.islands.slice(i + 1).forEach((b) => {
      assert.ok(separation(a.rect, b.rect) >= options.islandGap - 1e-6, `${a.key} too close to ${b.key}`)
    })
  })
})

it('every photo sits inside its island below the label band', () => {
  const layout = createGroupedLayout(makeGroups([7, 30, 1]), makePhotos(38), options)
  const rects = new Map(layout.islands.map(island => [island.key, island.rect]))
  assert.equal(layout.instances.length, 38)
  for (const instance of layout.instances) {
    const rect = rects.get(instance.key.split(':')[1])!
    assert.ok(instance.x >= rect.x - 1e-6 && instance.x + instance.w <= rect.x + rect.w + 1e-6)
    assert.ok(instance.y >= rect.y + options.labelHeight - 1e-6)
    assert.ok(instance.y + instance.h <= rect.y + rect.h + 1e-6)
  }
})

it('photos inside an island never overlap', () => {
  const layout = createGroupedLayout(makeGroups([40]), makePhotos(40), options)
  layout.instances.forEach((a, i) => {
    layout.instances.slice(i + 1).forEach((b) => {
      assert.ok(separation(a, b) >= options.gap - 1e-6)
    })
  })
})

it('instance keys name the group and the photo', () => {
  const layout = createGroupedLayout(makeGroups([2]), makePhotos(2), options)
  assert.deepEqual(
    layout.instances.map(instance => instance.key),
    ['g:g0:0', 'g:g0:1'],
  )
})

it('islands report their label and photo count', () => {
  const layout = createGroupedLayout(makeGroups([3, 1]), makePhotos(4), options)
  assert.deepEqual(
    layout.islands.map(island => [island.label, island.count, island.kind]),
    [
      ['Group 0', 3, 'value'],
      ['Group 1', 1, 'value'],
    ],
  )
})

it('bounds contain every island', () => {
  const layout = createGroupedLayout(makeGroups([7, 1, 30, 2, 2, 12]), makePhotos(54), options)
  for (const { rect } of layout.islands) {
    assert.ok(rect.x >= layout.bounds.x && rect.y >= layout.bounds.y)
    assert.ok(rect.x + rect.w <= layout.bounds.x + layout.bounds.w + 1e-6)
    assert.ok(rect.y + rect.h <= layout.bounds.y + layout.bounds.h + 1e-6)
  }
})

it('islands read left to right, then top to bottom, in group order', () => {
  const layout = createGroupedLayout(makeGroups(Array.from<number>({ length: 12 }).fill(4)), makePhotos(48), options)
  for (let i = 1; i < layout.islands.length; i++) {
    const previous = layout.islands[i - 1].rect
    const current = layout.islands[i].rect
    assert.ok(current.y > previous.y || (current.y === previous.y && current.x > previous.x))
  }
})

it('forty equal islands wrap into rows close to the requested aspect', () => {
  const layout = createGroupedLayout(makeGroups(Array.from<number>({ length: 40 }).fill(9)), makePhotos(360), options)
  const aspect = layout.bounds.w / layout.bounds.h
  assert.ok(aspect > options.aspect / 2 && aspect < options.aspect * 2, `aspect ${aspect}`)
})

it('no groups produce an empty layout', () => {
  const layout = createGroupedLayout([], [], options)
  assert.deepEqual(layout, { islands: [], instances: [], bounds: { x: 0, y: 0, w: 0, h: 0 } })
})
