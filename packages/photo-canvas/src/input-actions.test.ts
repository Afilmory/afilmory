import assert from 'node:assert/strict'

import { it } from 'vitest'

import { keyAction, pinchStep, wheelAction } from './input-actions'

const wheel = (patch: Partial<Parameters<typeof wheelAction>[0]>) =>
  wheelAction({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...patch })

it('a plain wheel scrolls the content against the wheel direction', () => {
  assert.deepEqual(wheel({ deltaX: 30, deltaY: 120 }), { type: 'pan', dx: -30, dy: -120 })
})

it('a line-mode wheel is converted to pixels', () => {
  assert.deepEqual(wheel({ deltaY: 3, deltaMode: 1 }), { type: 'pan', dx: 0, dy: -48 })
})

it('ctrl or meta wheel zooms: down zooms out, up zooms in', () => {
  const out = wheel({ deltaY: 10, ctrlKey: true })
  const zoomIn = wheel({ deltaY: -10, metaKey: true })
  assert.equal(out.type, 'zoom')
  assert.ok(out.type === 'zoom' && out.factor < 1)
  assert.ok(zoomIn.type === 'zoom' && zoomIn.factor > 1)
})

it('one huge wheel tick cannot zoom more than a bounded step', () => {
  const action = wheel({ deltaY: -10_000, ctrlKey: true })
  assert.ok(action.type === 'zoom' && action.factor < 2)
})

it('arrow keys pan the view toward the arrow', () => {
  assert.deepEqual(keyAction('ArrowRight'), { type: 'pan', dx: -120, dy: 0 })
  assert.deepEqual(keyAction('ArrowLeft'), { type: 'pan', dx: 120, dy: 0 })
  assert.deepEqual(keyAction('ArrowDown'), { type: 'pan', dx: 0, dy: -120 })
  assert.deepEqual(keyAction('ArrowUp'), { type: 'pan', dx: 0, dy: 120 })
})

it('plus, minus and zero zoom in, zoom out and reset', () => {
  assert.deepEqual(keyAction('+'), { type: 'step', direction: 1 })
  assert.deepEqual(keyAction('='), { type: 'step', direction: 1 })
  assert.deepEqual(keyAction('-'), { type: 'step', direction: -1 })
  assert.deepEqual(keyAction('0'), { type: 'reset' })
})

it('other keys do nothing', () => {
  assert.equal(keyAction('a'), null)
})

it('a pinch zooms by the change in finger distance around the fingers midpoint', () => {
  const step = pinchStep(
    [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ],
    [
      { x: 50, y: 120 },
      { x: 450, y: 120 },
    ],
  )
  assert.deepEqual(step, { factor: 2, center: { x: 250, y: 120 }, dx: 50, dy: 20 })
})
