import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { PhotoColor } from '../color'
import type { CanvasPhoto } from '../types'
import { createSpectrumLayout } from './spectrum'

const photo = (index: number): CanvasPhoto => ({
  id: `p${index}`,
  aspectRatio: [0.667, 1.5, 1.333][index % 3],
  thumbnailUrl: '',
  thumbHash: null,
  dateTaken: '',
  camera: null,
  tags: [],
  place: null,
})
const options = { columnWidth: 220, gap: 12, aspect: 1.6 }

const build = (colors: (PhotoColor | null)[]) => {
  const photos = colors.map((_, index) => photo(index))
  return createSpectrumLayout(photos, colors, options)
}

it('places every photo exactly once without overlap', () => {
  const colors = Array.from({ length: 200 }).map((_, i) => ({ h: (i * 37) % 360, s: 0.6, l: 0.2 + (i % 7) / 10 }))
  const layout = build(colors)
  assert.equal(layout.instances.length, 200)
  assert.equal(new Set(layout.instances.map(i => i.photoIndex)).size, 200)
  for (const a of layout.instances) {
    for (const b of layout.instances) {
      if (a === b) {
        continue
      }
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
      assert.ok(apart, `${a.key} overlaps ${b.key}`)
    }
  }
})

it('hue never decreases from left to right', () => {
  const colors = Array.from({ length: 120 }).map((_, i) => ({ h: (i * 53) % 360, s: 0.7, l: 0.5 }))
  const layout = build(colors)
  const sorted = [...layout.instances].sort((a, b) => a.x - b.x)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x > sorted[i - 1].x) {
      assert.ok(colors[sorted[i].photoIndex]!.h >= colors[sorted[i - 1].photoIndex]!.h - 1e-9)
    }
  }
})

it('grey and colourless photos sit to the right of every coloured one', () => {
  const colors: (PhotoColor | null)[] = [
    { h: 10, s: 0.8, l: 0.5 },
    { h: 200, s: 0.02, l: 0.5 },
    null,
    { h: 300, s: 0.7, l: 0.4 },
  ]
  const layout = build(colors)
  const x = (photoIndex: number) => layout.instances.find(i => i.photoIndex === photoIndex)!.x
  assert.ok(x(1) > x(0) && x(1) > x(3))
  assert.ok(x(2) > x(0) && x(2) > x(3))
})

it('within a column lighter photos are above darker ones', () => {
  const colors = Array.from({ length: 40 }).map((_, i) => ({ h: 100, s: 0.8, l: ((i * 7) % 40) / 50 + 0.1 }))
  const layout = build(colors)
  const columns = new Map<number, typeof layout.instances>()
  for (const instance of layout.instances) {
    columns.set(instance.x, [...(columns.get(instance.x) ?? []), instance])
  }
  assert.ok([...columns.values()].some(column => column.length > 1))
  for (const column of columns.values()) {
    column.sort((a, b) => a.y - b.y)
    for (let i = 1; i < column.length; i++) {
      assert.ok(colors[column[i].photoIndex].l <= colors[column[i - 1].photoIndex].l)
    }
  }
})

it('has no islands and bounds that contain every photo', () => {
  const layout = build([
    { h: 10, s: 0.8, l: 0.5 },
    { h: 190, s: 0.8, l: 0.5 },
  ])
  assert.deepEqual(layout.islands, [])
  for (const i of layout.instances) {
    assert.ok(i.x >= layout.bounds.x && i.x + i.w <= layout.bounds.x + layout.bounds.w)
    assert.ok(i.y >= layout.bounds.y && i.y + i.h <= layout.bounds.y + layout.bounds.h)
  }
})

it('an empty list has an empty layout', () => {
  assert.equal(build([]).instances.length, 0)
})
