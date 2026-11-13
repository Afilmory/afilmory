import assert from 'node:assert/strict'

import { it } from 'vitest'

import { maxScale, pickTier, textureBytes } from './tiers'

it('pickTier stays on the placeholder below 48 CSS pixels', () => {
  assert.equal(pickTier(47, 2), 0)
  assert.equal(pickTier(10, 3), 0)
})

it('pickTier picks the smallest tier that covers the device pixels', () => {
  assert.equal(pickTier(48, 1), 128)
  assert.equal(pickTier(128, 1), 128)
  assert.equal(pickTier(129, 1), 256)
  assert.equal(pickTier(100, 2), 256)
  assert.equal(pickTier(200, 2), 512)
})

it('pickTier never exceeds the largest tier', () => {
  assert.equal(pickTier(2000, 3), 512)
})

it('maxScale stops where a photo would exceed 1.5× its thumbnail pixels', () => {
  assert.equal(maxScale(250, 1), 3.6)
  assert.equal(maxScale(250, 2), 1.8)
  assert.equal(maxScale(300, 1, 400), 2)
})

it('textureBytes counts four bytes per pixel of a square cell', () => {
  assert.equal(textureBytes(256), 262_144)
})
