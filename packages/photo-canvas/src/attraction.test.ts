import assert from 'node:assert/strict'

import { it } from 'vitest'

import { applyAttraction, DIMMED_ALPHA, isRelated, planAttraction } from './attraction'
import type { DrawInstance } from './core'
import type { CanvasPhoto } from './types'

const photo = (id: string, patch: Partial<CanvasPhoto> = {}): CanvasPhoto => ({
  id,
  aspectRatio: 1.5,
  thumbnailUrl: '',
  thumbHash: null,
  dateTaken: '2025-05-10T00:00:00Z',
  camera: null,
  tags: [],
  place: null,
  ...patch,
})
const at = (key: string, photoIndex: number, id: string, x: number, y: number): DrawInstance => ({
  key,
  photoIndex,
  id,
  x,
  y,
  w: 200,
  h: 133,
  alpha: 1,
})

it('photos are related by camera only when both name the same camera', () => {
  assert.equal(isRelated('camera', photo('a', { camera: 'X-T5' }), photo('b', { camera: 'X-T5' }), null, null), true)
  assert.equal(isRelated('camera', photo('a', { camera: 'X-T5' }), photo('b', { camera: 'Z f' }), null, null), false)
  assert.equal(isRelated('camera', photo('a'), photo('b'), null, null), false)
})

it('photos are related by month when taken in the same month', () => {
  assert.equal(isRelated('month', photo('a'), photo('b', { dateTaken: '2025-05-30T00:00:00Z' }), null, null), true)
  assert.equal(isRelated('month', photo('a'), photo('b', { dateTaken: '2025-06-01T00:00:00Z' }), null, null), false)
})

it('photos are related by tag when they share one', () => {
  assert.equal(isRelated('tag', photo('a', { tags: ['bird', 'x'] }), photo('b', { tags: ['bird'] }), null, null), true)
  assert.equal(isRelated('tag', photo('a', { tags: ['x'] }), photo('b', { tags: ['bird'] }), null, null), false)
})

it('photos are related by colour when their hues are close', () => {
  const red = { h: 5, s: 0.7, l: 0.5 }
  assert.equal(isRelated('color', photo('a'), photo('b'), red, { h: 350, s: 0.6, l: 0.45 }), true)
  assert.equal(isRelated('color', photo('a'), photo('b'), red, { h: 120, s: 0.6, l: 0.45 }), false)
  assert.equal(isRelated('color', photo('a'), photo('b'), red, null), false)
})

const photos = [
  photo('a', { camera: 'X-T5' }),
  photo('b', { camera: 'X-T5' }),
  photo('c', { camera: 'Z f' }),
  photo('d', { camera: 'X-T5' }),
]
const instances = [
  at('a1', 0, 'a', 0, 0),
  at('b1', 1, 'b', 2000, 0),
  at('b2', 1, 'b', 300, 0),
  at('c1', 2, 'c', 600, 0),
  at('d1', 3, 'd', 0, 500),
]
const colors = [null, null, null, null]

it('pulls one copy of each related photo, the copy nearest the held one', () => {
  const plan = planAttraction(instances, photos, colors, 'a1', 'camera')!
  assert.deepEqual([...plan.targets.keys()].sort(), ['b2', 'd1'])
})

it('pulled photos land around the held photo without covering it', () => {
  const plan = planAttraction(instances, photos, colors, 'a1', 'camera')!
  const held = plan.targets.get('b2')!
  for (const target of plan.targets.values()) {
    const apart
      = target.x + target.w <= plan.held.x
        || plan.held.x + plan.held.w <= target.x
        || target.y + target.h <= plan.held.y
        || plan.held.y + plan.held.h <= target.y
    assert.ok(apart)
  }
  assert.ok(held.w < 200)
})

it('there is nothing to pull when no other photo is related', () => {
  assert.equal(planAttraction(instances, photos, colors, 'c1', 'camera'), null)
})

it('never pulls more than the cap', () => {
  const many = Array.from({ length: 80 }).map((_, i) => photo(`m${i}`, { camera: 'X-T5' }))
  const list = many.map((p, i) => at(`k${i}`, i, p.id, (i % 10) * 220, Math.floor(i / 10) * 150))
  const plan = planAttraction(
    list,
    many,
    many.map(() => null),
    'k0',
    'camera',
  )!
  assert.equal(plan.targets.size, 24)
})

it('at progress 0 nothing has moved or dimmed', () => {
  const plan = planAttraction(instances, photos, colors, 'a1', 'camera')!
  const drawn = applyAttraction(instances, plan, 0)
  for (const instance of instances) {
    const out = drawn.find(i => i.key === instance.key)!
    assert.deepEqual({ ...out }, { ...instance })
  }
})

it('at progress 1 pulled photos are at their targets, the rest are dimmed, and the held photo is drawn last', () => {
  const plan = planAttraction(instances, photos, colors, 'a1', 'camera')!
  const drawn = applyAttraction(instances, plan, 1)
  const byKey = (key: string) => drawn.find(i => i.key === key)!
  assert.equal(byKey('b2').x, plan.targets.get('b2')!.x)
  assert.equal(byKey('b2').alpha, 1)
  assert.equal(byKey('c1').alpha, DIMMED_ALPHA)
  assert.equal(byKey('b1').alpha, DIMMED_ALPHA)
  assert.equal(drawn.at(-1)!.key, 'a1')
  assert.ok(byKey('a1').w > 200)
})
