import assert from 'node:assert/strict'

import { it } from 'vitest'

import { interpolateRect, planTransition } from './transition'
import type { Instance } from './types'

const at = (key: string, photoIndex: number, x: number, y = 0): Instance => ({ key, photoIndex, x, y, w: 100, h: 100 })
const origin = { x: 50, y: 50 }
const keys = (instances: Instance[]) => instances.map(instance => instance.key)

it('a photo with several source copies flies from the copy nearest the old center', () => {
  const plan = planTransition({
    from: [at('far', 0, 900), at('near', 0, 10), at('farther', 0, -2000)],
    to: [at('island', 0, 400)],
    fromIds: ['a'],
    toIds: ['a'],
    fromCenter: origin,
    toCenter: origin,
  })
  assert.deepEqual(
    plan.moves.map(move => [move.id, move.from.key, move.to.key]),
    [['a', 'near', 'island']],
  )
  assert.deepEqual(keys(plan.fadeOut), ['far', 'farther'])
  assert.deepEqual(plan.fadeIn, [])
})

it('a photo with several target copies flies to the copy nearest the new center', () => {
  const plan = planTransition({
    from: [at('island', 0, 0)],
    to: [at('far', 0, 5000), at('near', 0, 480)],
    fromIds: ['a'],
    toIds: ['a'],
    fromCenter: origin,
    toCenter: { x: 500, y: 50 },
  })
  assert.deepEqual(
    plan.moves.map(move => [move.from.key, move.to.key]),
    [['island', 'near']],
  )
  assert.deepEqual(keys(plan.fadeIn), ['far'])
})

it('a photo that only exists before the switch fades out', () => {
  const plan = planTransition({
    from: [at('gone', 0, 0), at('stay', 1, 200)],
    to: [at('stay2', 0, 300)],
    fromIds: ['x', 'keep'],
    toIds: ['keep'],
    fromCenter: origin,
    toCenter: origin,
  })
  assert.deepEqual(keys(plan.fadeOut), ['gone'])
  assert.deepEqual(
    plan.moves.map(move => [move.id, move.from.key, move.to.key]),
    [['keep', 'stay', 'stay2']],
  )
})

it('a photo that only exists after the switch fades in', () => {
  const plan = planTransition({
    from: [],
    to: [at('fresh', 0, 0)],
    fromIds: [],
    toIds: ['n'],
    fromCenter: origin,
    toCenter: origin,
  })
  assert.deepEqual(keys(plan.fadeIn), ['fresh'])
  assert.deepEqual(plan.moves, [])
})

it('interpolateRect returns the endpoints at 0 and 1 and the midpoint at 0.5', () => {
  const from = { x: 0, y: 100, w: 200, h: 100 }
  const to = { x: 400, y: -100, w: 100, h: 300 }
  assert.deepEqual(interpolateRect(from, to, 0), from)
  assert.deepEqual(interpolateRect(from, to, 1), to)
  assert.deepEqual(interpolateRect(from, to, 0.5), { x: 200, y: 0, w: 150, h: 200 })
})
