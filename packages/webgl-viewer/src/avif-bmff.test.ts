import assert from 'node:assert/strict'

import { it } from 'vitest'

import { box, boxes, bytes, join, Reader, text, uint } from './avif-bmff'

it('reads ordinary, extended-size, and final zero-sized boxes', () => {
  const payload = bytes(1, 2, 3)
  for (const data of [box('free', payload), join(uint(1), text('free'), uint(19, 8), payload), join(uint(0), text('free'), payload)]) {
    assert.deepEqual(boxes(data)[0].data, payload)
  }
})

it('bounds fields and rejects unsafe 64-bit integers', () => {
  assert.throws(() => new Reader(bytes(255, 255, 255, 255, 255, 255, 255, 255)).uint(8), /safe range/)
  assert.throws(() => new Reader(bytes(1)).uint(2), /Truncated/)
  assert.throws(() => boxes(join(uint(7), text('free'))), /length/)
  assert.throws(() => boxes(join(uint(32), text('free'))), /Truncated/)
})
