import assert from 'node:assert/strict'

import { it } from 'vitest'

import {
  clampToBounds,
  decayVelocity,
  fitRect,
  screenToWorld,
  springToward,
  visibleWorldRect,
  worldRectToScreen,
  worldToScreen,
  zoomAt,
} from './camera'

const vp = { width: 1000, height: 800 }
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

it('screenToWorld maps the viewport center to the camera position', () => {
  assert.deepEqual(screenToWorld({ x: 300, y: -50, scale: 2 }, vp, { x: 500, y: 400 }), { x: 300, y: -50 })
})

it('screenToWorld divides screen offsets by scale', () => {
  assert.deepEqual(screenToWorld({ x: 0, y: 0, scale: 2 }, vp, { x: 700, y: 500 }), { x: 100, y: 50 })
})

it('worldToScreen is the inverse of screenToWorld', () => {
  const cam = { x: 123, y: -456, scale: 0.7 }
  const s = worldToScreen(cam, vp, screenToWorld(cam, vp, { x: 37, y: 611 }))
  near(s.x, 37)
  near(s.y, 611)
})

it('worldRectToScreen scales size and offsets position', () => {
  assert.deepEqual(worldRectToScreen({ x: 0, y: 0, scale: 0.5 }, vp, { x: 100, y: 200, w: 40, h: 60 }), {
    x: 550,
    y: 500,
    w: 20,
    h: 30,
  })
})

it('visibleWorldRect covers the viewport plus a screen-space margin', () => {
  assert.deepEqual(visibleWorldRect({ x: 0, y: 0, scale: 2 }, vp, 100), { x: -300, y: -250, w: 600, h: 500 })
})

it('zoomAt keeps the world point under the cursor fixed', () => {
  const cam = { x: 40, y: 90, scale: 1 }
  const cursor = { x: 820, y: 130 }
  const before = screenToWorld(cam, vp, cursor)
  const next = zoomAt(cam, vp, cursor, 1.7, { min: 0.1, max: 10 })
  const after = screenToWorld(next, vp, cursor)
  near(next.scale, 1.7)
  near(after.x, before.x)
  near(after.y, before.y)
})

it('zoomAt clamps scale to the limits', () => {
  assert.equal(zoomAt({ x: 0, y: 0, scale: 1 }, vp, { x: 0, y: 0 }, 100, { min: 0.5, max: 2 }).scale, 2)
  assert.equal(zoomAt({ x: 0, y: 0, scale: 1 }, vp, { x: 0, y: 0 }, 0.001, { min: 0.5, max: 2 }).scale, 0.5)
})

it('clampToBounds pins the camera center inside the bounds', () => {
  const bounds = { x: -100, y: -50, w: 300, h: 200 }
  assert.deepEqual(clampToBounds({ x: 900, y: -900, scale: 1.5 }, bounds), { x: 200, y: -50, scale: 1.5 })
  assert.deepEqual(clampToBounds({ x: 10, y: 20, scale: 1 }, bounds), { x: 10, y: 20, scale: 1 })
})

it('fitRect centers the rect and fits the tighter axis inside the padding', () => {
  assert.deepEqual(fitRect({ x: 100, y: 100, w: 1600, h: 400 }, vp, 100), { x: 900, y: 300, scale: 0.5 })
  assert.deepEqual(fitRect({ x: 0, y: 0, w: 300, h: 1200 }, vp, 100), { x: 150, y: 600, scale: 0.5 })
})

it('decayVelocity shrinks velocity over time and never flips its sign', () => {
  const v = decayVelocity(2, 100)
  assert.ok(v > 0 && v < 2)
  assert.ok(decayVelocity(-2, 100) < 0)
  assert.ok(Math.abs(decayVelocity(2, 2000)) < 0.01)
})

it('springToward settles on the target within its duration without overshoot', () => {
  let state = { value: 0, velocity: 0 }
  let max = 0
  for (let t = 0; t < 400; t += 16) {
    state = springToward(state.value, 100, state.velocity, 16, 400)
    max = Math.max(max, state.value)
  }
  assert.ok(max <= 100 + 1e-9, `overshoot ${max}`)
  assert.ok(Math.abs(state.value - 100) < 1, `not settled: ${state.value}`)
})

it('springToward moves monotonically toward a lower target', () => {
  const a = springToward(50, 0, 0, 16, 400)
  const b = springToward(a.value, 0, a.velocity, 16, 400)
  assert.ok(a.value < 50 && b.value < a.value && b.value > 0)
})
