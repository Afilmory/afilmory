import assert from 'node:assert/strict'

import { rgbaToThumbHash } from 'thumbhash'
import { it } from 'vitest'

import { colorOfThumbHash, hueDistance, rgbToHsl } from './color'

const solid = (r: number, g: number, b: number) => {
  const rgba = new Uint8Array(16 * 16 * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba.set([r, g, b, 255], i)
  }
  return rgbaToThumbHash(16, 16, rgba)
}

it('rgbToHsl reads pure red as hue 0, fully saturated, mid lightness', () => {
  assert.deepEqual(rgbToHsl(1, 0, 0), { h: 0, s: 1, l: 0.5 })
})

it('rgbToHsl gives grey no saturation', () => {
  assert.equal(rgbToHsl(0.5, 0.5, 0.5).s, 0)
})

it('a blue thumbhash reads as a blue hue', () => {
  const color = colorOfThumbHash(solid(20, 40, 230))!
  assert.ok(hueDistance(color.h, 235) < 20, `hue ${color.h}`)
  assert.ok(color.s > 0.5)
})

it('a photo without a thumbhash has no colour', () => {
  assert.equal(colorOfThumbHash(null), null)
})

it('hue distance wraps around the colour wheel', () => {
  assert.equal(hueDistance(350, 10), 20)
})
